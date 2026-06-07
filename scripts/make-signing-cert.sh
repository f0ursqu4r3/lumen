#!/usr/bin/env bash
#
# Create a self-signed code-signing identity in the login keychain for local
# Lumen builds. Self-signing produces a *valid* signature, which on a downloaded
# (quarantined) app usually turns the hard "… is damaged" wall into the softer
# "unidentified developer" that opens via right-click → Open. It does NOT fully
# satisfy Gatekeeper — only an Apple Developer ID + notarization does that.
#
# Usage:
#   scripts/make-signing-cert.sh ["Identity Name"]      # default: "Lumen Self-Signed"
#   export ELECTROBUN_DEVELOPER_ID="Lumen Self-Signed"
#   bun run dist                                         # signs (a release build; `build` is dev/unsigned)
#
# If this CLI path misbehaves, the reliable fallback is Keychain Access →
# Certificate Assistant → Create a Certificate (Identity Type: Self Signed Root,
# Certificate Type: Code Signing).
set -euo pipefail

CERT_NAME="${1:-Lumen Self-Signed}"
KEYCHAIN="$HOME/Library/Keychains/login.keychain-db"

if security find-identity -p codesigning | grep -qF "$CERT_NAME"; then
  echo "✓ Code-signing identity already exists: \"$CERT_NAME\""
  echo "  export ELECTROBUN_DEVELOPER_ID=\"$CERT_NAME\""
  exit 0
fi

tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cat > "$tmp/openssl.cnf" <<EOF
[req]
distinguished_name = dn
x509_extensions = v3
prompt = no
[dn]
CN = $CERT_NAME
[v3]
basicConstraints = critical, CA:false
keyUsage = critical, digitalSignature
extendedKeyUsage = critical, codeSigning
EOF

openssl req -x509 -newkey rsa:2048 -nodes \
  -keyout "$tmp/key.pem" -out "$tmp/cert.pem" \
  -days 3650 -config "$tmp/openssl.cnf" >/dev/null 2>&1

# Use a real (temporary) password: an empty-password PKCS#12 produces a MAC that
# macOS `security import` rejects ("MAC verification failed"). Use the -legacy
# format when available (OpenSSL 3 defaults to AES-256, which macOS can't import;
# LibreSSL has no -legacy flag and already writes a compatible format).
P12_PASS="lumen-$$"
legacy=""
if openssl pkcs12 -help 2>&1 | grep -q -- "-legacy"; then legacy="-legacy"; fi
openssl pkcs12 -export $legacy -inkey "$tmp/key.pem" -in "$tmp/cert.pem" \
  -name "$CERT_NAME" -out "$tmp/identity.p12" -passout pass:"$P12_PASS" >/dev/null 2>&1

# -A: let any tool use the key; -T codesign: pre-authorize codesign so it doesn't
# prompt on every build.
security import "$tmp/identity.p12" -k "$KEYCHAIN" -P "$P12_PASS" -A -T /usr/bin/codesign

echo "✓ Created self-signed code-signing identity: \"$CERT_NAME\""
echo
echo "Next:"
echo "  export ELECTROBUN_DEVELOPER_ID=\"$CERT_NAME\""
echo "  bun run dist        # release build; signs (the default 'build' is dev = unsigned)"
echo
echo "(The first build may prompt once to use the key — click \"Always Allow\".)"
