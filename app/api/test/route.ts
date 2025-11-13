import { createJob, runJob } from '@lithiumqai/builder'
import { initializeBusiness } from '@/business/init'

initializeBusiness() // make sure your steps are registered

export async function POST(request: Request) {
  const body = await request.json()

  const job = await createJob({
    name: 'Hello Workflow',
    steps: ['step1'], // refers to your helloStep
    input: body,
  })

  // For local testing, run synchronously
  const result = await runJob(job.id)

  return Response.json(result)
}
