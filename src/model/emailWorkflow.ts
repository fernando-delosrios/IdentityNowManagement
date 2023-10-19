import {
    CreateWorkflowRequestBeta,
    Owner,
    WorkflowBodyOwnerBeta,
    WorkflowsBetaApiCreateWorkflowRequest,
} from 'sailpoint-api-client'

export class EmailWorkflow implements WorkflowsBetaApiCreateWorkflowRequest {
    createWorkflowRequestBeta: CreateWorkflowRequestBeta

    constructor(name: string, owner: Owner) {
        this.createWorkflowRequestBeta = {
            name,
            owner: owner as WorkflowBodyOwnerBeta,
            definition: {
                start: 'Send Email',
                steps: {
                    'End Step — Success': {
                        type: 'success',
                    },
                    'Send Email': {
                        actionId: 'sp:send-email',
                        attributes: {
                            'body.$': '$.trigger.body',
                            context: {},
                            'recipientEmailList.$': '$.trigger.recipients',
                            'subject.$': '$.trigger.subject',
                        },
                        nextStep: 'End Step — Success',
                        type: 'action',
                        versionNumber: 2,
                    },
                },
            },
            trigger: {
                type: 'EXTERNAL',
                attributes: {
                    id: 'idn:external:id',
                },
            },
        }
    }
}
