const TOKEN = 'Bearer pn_22zvaOtn9H6mmwNKktsuKd91F8UDdLnuu085N5bw'
async function test() {
  const cardId = '36ab6ad7-4e2a-496e-b081-422d186de664'
  const stepId = '884ffe20-5cdb-4549-9301-07d38dc278a1'
  const payload = {
    fields: ["stepId"],
    stepId
  }
  const res = await fetch(`https://api.wts.chat/crm/v2/panel/card/${cardId}`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: TOKEN
    },
    body: JSON.stringify(payload)
  })
  const json = await res.json().catch(() => null)
  console.log("Status:", res.status)
  console.log("Response:", json)
}
test()
