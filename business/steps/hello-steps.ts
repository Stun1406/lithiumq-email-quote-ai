import type { StepDefinition } from '@lithiumqai/builder/types'

export const helloStep: StepDefinition = {
  name: 'step1',
  description: 'Hello World Step',
  handler: async (input) => {
    return { message: 'Hello from LithiumQ Builder!' }
  },
  timeout: 5000,
  retryable: false,
}

export const mySteps = [helloStep]
