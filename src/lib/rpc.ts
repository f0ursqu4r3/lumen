import Electrobun, { Electroview } from "electrobun/view";
import type { TragitRequests } from "./rpcContract";

const rpcDef = Electroview.defineRPC<any>({
  maxRequestTime: 30000,
  handlers: { requests: {}, messages: {} },
});
const electrobun = new Electrobun.Electroview({ rpc: rpcDef });

// One typed funnel over the loosely-typed framework client.
const request = (electrobun.rpc as any).request as TragitRequests;

export const rpc: TragitRequests = {
  gitlabGraphql: (a) => request.gitlabGraphql(a),
  gitlabRest: (a) => request.gitlabRest(a),
  gitlabAsset: (a) => request.gitlabAsset(a),
  getConfig: () => request.getConfig(),
  saveConfig: (a) => request.saveConfig(a),
  clearConfig: () => request.clearConfig(),
};
