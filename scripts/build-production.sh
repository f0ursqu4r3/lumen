#!/usr/bin/env bash
set -euo pipefail

bunx vue-tsc --noEmit
bunx vite build
repo_root="$(pwd)"

# macOS 26's iconutil rejects standard .iconset folders in this environment.
# Electrobun only needs an AppIcon.icns at the requested output path, and the
# repo already carries a valid one, so scope a tiny shim to this build command.
shim_dir="$(mktemp -d)"
trap 'rm -rf "$shim_dir"' EXIT

cat > "$shim_dir/iconutil" <<EOF
#!/usr/bin/env bash
set -euo pipefail
out=""
prev=""
for arg in "\$@"; do
  if [[ "\$prev" == "-o" ]]; then
    out="\$arg"
    break
  fi
  prev="\$arg"
done
if [[ -z "\$out" ]]; then
  exit 1
fi
cp "$repo_root/assets/macos/AppIcon.icns" "\$out"
EOF
chmod +x "$shim_dir/iconutil"

PATH="$shim_dir:$PATH" bunx electrobun build --env=stable
