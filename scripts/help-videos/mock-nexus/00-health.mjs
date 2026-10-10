/** Health check, so the mock is never empty. */
const routes = {
  "GET /health": () => ({ ok: true, mock: true }),
};
export default routes;
