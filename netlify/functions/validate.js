export async function handler(event) {
  return {
    statusCode: 200,
    body: JSON.stringify({
      ok: true,
      msg: "MWAL VALIDATOR ONLINE",
      method: event.httpMethod
    })
  };
}
