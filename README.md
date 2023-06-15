IdentityNow Management (SaaS)<a name="TOP"></a>
===================

- - - - 

This is an IdentityNow loopback connector for managing platform's governance groups and roles like admin, helpdesk, etc., and governance groups like any other managed source.

- - - - 
Functionalities of Connector:-

* Capable of calling private APIs (Authkeeper to remove permissions), which is only possible through browser-generated access tokens.
* Remove all entitlements (Admin Capabilities and Governance Group) and also disable identity upon inactive LCS (No BeforeProvisioningRule is needed)
* Implements Role-Based Provisioning for Governance Group and Admin Capabilities
* Offers the ability to add, remove, and manage identities as part of the governance group and those with admin capabilities.
  
- - - - 

The connector uses username and hashed password from the native login to call private api.
Steps to get username and Hashed passed:-

1. Go to IdentityNow login page
2. Intercept the network using developer tools (ctrl+shift+I)
3. Type in your admin privileged username and password
4. Look for call that says auth
5. The URL is the SailPoint Login URL
6. Click on payload and copy the IDToken1 and IDToken2 which are username and hashed password respectively.

