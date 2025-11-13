import { registerSteps } from '@lithiumqai/builder'
import { mySteps } from './steps/hello-steps'

export function initializeBusiness() {
  registerSteps(mySteps)
  console.log('✅ Business logic initialized')
}
