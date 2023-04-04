import { Attributes } from '@sailpoint/connector-sdk'

export class Role {
    identity: string;
    uuid: string;
    type: string = 'group';
    attributes: Attributes;

    constructor(object: any) {
        this.attributes = {
            type: "Role",
            name: object.name,
            id: object.value,
            description: object.description
        }
        this.identity = this.attributes.id as string;
        this.uuid = this.attributes.name as string;
    }
}
