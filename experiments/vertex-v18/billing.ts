import "dotenv/config";
import { GoogleAuth } from "google-auth-library";
import { VertexSettingsSchema } from "./connection.js";
import { atomicJson, now, readJson, resolveRoot, sleep } from "../../src/utils.js";

// Verification is read-only unless the explicit setup flag enables the Billing
// API. No billing-account linkage or payment setting is changed.
// Never print credentials, tokens or request headers.
async function main() {
  const settings = VertexSettingsSchema.parse(await readJson(resolveRoot("config/vertex-v18.json")));
  const auth = new GoogleAuth({ scopes: ["https://www.googleapis.com/auth/cloud-platform"], clientOptions: { quotaProjectId: settings.project } });
  const client = await auth.getClient();
  const options = { timeout: 30000, headers: { "x-goog-user-project": settings.project } };
  if (process.argv.includes("--enable-billing-api")) {
    let { data: operation } = await client.request<{ name?: string; done?: boolean; error?: { message?: string } }>({ ...options, method: "POST", data: {}, url: `https://serviceusage.googleapis.com/v1/projects/${settings.project}/services/cloudbilling.googleapis.com:enable` });
    if (!operation.name || !/^operations\/[a-zA-Z0-9._/-]+$/.test(operation.name)) throw new Error("Resposta inválida ao habilitar Cloud Billing API.");
    const deadline = Date.now() + 30000;
    while (!operation.done && Date.now() < deadline) {
      await sleep(2000);
      ({ data: operation } = await client.request<{ name?: string; done?: boolean; error?: { message?: string } }>({ ...options, url: `https://serviceusage.googleapis.com/v1/${operation.name}` }));
    }
    if (!operation.done || operation.error) throw new Error(operation.error?.message ?? "Habilitação ainda em processamento; consulte novamente.");
  }
  const { data: project } = await client.request<{ billingAccountName?: string; billingEnabled?: boolean; projectId?: string }>({ ...options, url: `https://cloudbilling.googleapis.com/v1/projects/${settings.project}/billingInfo` });
  if (!/^billingAccounts\/[A-Z0-9-]+$/.test(project.billingAccountName ?? "")) throw new Error("Projeto sem conta de faturamento identificável.");
  const { data: account } = await client.request<{ name?: string; displayName?: string; open?: boolean }>({ ...options, url: `https://cloudbilling.googleapis.com/v1/${project.billingAccountName}` });
  const result = { at: now(), project: settings.project, billingAccountName: account.name, billingAccountDisplayName: account.displayName, billingEnabled: project.billingEnabled === true, billingAccountOpen: account.open === true, matchesUserProvidedName: account.displayName === "Minha conta de faturamento", creditBalanceVerified: false, creditApplicationVerified: false, note: "Cloud Billing API confirma vínculo e conta. Saldo, validade e aplicação do crédito específico ainda dependem do painel de créditos/faturamento." };
  await atomicJson(resolveRoot("output/vertex-v18/billing-check.json"), result);
  console.log(JSON.stringify(result, null, 2));
}
main().catch(error => {
  // Gaxios errors contain request headers. Keep only status and server message.
  console.error(JSON.stringify({ status: error?.response?.status ?? null, message: error?.response?.data?.error?.message ?? error.message }));
  process.exitCode = 1;
});
