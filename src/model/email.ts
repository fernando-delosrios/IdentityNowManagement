import { TestWorkflowRequestBeta } from 'sailpoint-api-client'

export class ErrorEmail implements TestWorkflowRequestBeta {
    input: object
    constructor(recipient: string, error: string) {
        const subject = `IdentityNow Management error report`
        const body = error
        this.input = {
            recipients: [recipient],
            subject,
            body,
        }
    }
}
