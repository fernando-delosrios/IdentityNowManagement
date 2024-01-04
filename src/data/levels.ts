export type LevelSource = {
    name: string
    value: string
    description: string
}

export const levels: LevelSource[] = [
    { name: 'Helpdesk', value: 'HELPDESK', description: 'Helpdesk access to IdentityNow' },
    { name: 'Administrator', value: 'ORG_ADMIN', description: 'Full administrative access to IdentityNow' },
    {
        name: 'Cert Administrator',
        value: 'CERT_ADMIN',
        description: 'Cert Administrator access to IdentityNow',
    },
    {
        name: 'Report Administrator',
        value: 'REPORT_ADMIN',
        description: 'Report Administrator access to IdentityNow',
    },
    {
        name: 'Role Administrator',
        value: 'ROLE_ADMIN',
        description: 'Role Administrator access to IdentityNow',
    },
    {
        name: 'Role SubAdministrator',
        value: 'ROLE_SUBADMIN',
        description: 'Role SubAdministrator access to IdentityNow',
    },
    {
        name: 'Source Administrator',
        value: 'SOURCE_ADMIN',
        description: 'Source Administrator access to IdentityNow',
    },
    {
        name: 'Source Subadministrator',
        value: 'SOURCE_SUBADMIN',
        description: 'Source Subadministrator access to IdentityNow',
    },
    {
        name: 'Cloud Gov Admin',
        value: 'CLOUD_GOV_ADMIN',
        description: 'Cloud Gov Admin access to IdentityNow',
    },
    {
        name: 'Cloud Gov User',
        value: 'CLOUD_GOV_USER',
        description: 'Cloud Gov User access to IdentityNow',
    },
    {
        name: 'Access Intelligence Center - Reader',
        value: 'sp:aic-dashboard-read',
        description: 'Access Intelligence Center - Reader access to IdentityNow',
    },
    {
        name: 'Access Intelligence Center - Author',
        value: 'sp:aic-dashboard-write',
        description: 'Access Intelligence Center - Author access to IdentityNow',
    },
    {
        name: 'Access Intelligence Center - Admin',
        value: 'sp:aic-dashboard-admin',
        description: 'Access Intelligence Center - Admin access to IdentityNow',
    },
    {
        name: 'SaaS Management - Admin',
        value: 'SAAS_MANAGEMENT_ADMIN',
        description: 'Admin access to SaaS Management',
    },
    {
        name: 'SaaS Management - Reader',
        value: 'SAAS_MANAGEMENT_READER',
        description: 'Reader access to SaaS Management',
    },
    {
        name: 'Data Access Security Administrator',
        value: 'das:ui-administrator',
        description: 'Administrator access to Data Access Security',
    },
    {
        name: 'Data Access Security Compliance Manager',
        value: 'das:ui-compliance_manager',
        description: 'Compliance Manager access to Data Access Security',
    },
    {
        name: 'Data Access Data Owner',
        value: 'das:ui-data_owner',
        description: 'Data Owner access to Data Access Security',
    },
    {
        name: 'Data Access Security Auditor',
        value: 'das:ui-auditor',
        description: 'Auditor access to Data Access Security',
    },
]
