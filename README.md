[![Discourse Topics][discourse-shield]][discourse-url]
[![Issues][issues-shield]][issues-url]
[![Latest Releases][release-shield]][release-url]
[![Contributor Shield][contributor-shield]][contributors-url]

[discourse-shield]: https://img.shields.io/discourse/topics?label=Discuss%20This%20Tool&server=https%3A%2F%2Fdeveloper.sailpoint.com%2Fdiscuss
[discourse-url]: https://developer.sailpoint.com/discuss/t/identitynow-management-saas-connector/18175
[issues-shield]: https://img.shields.io/github/issues/sailpoint-oss/colab-identitynow-management?label=Issues
[issues-url]: https://github.com/sailpoint-oss/colab-identitynow-management/issues
[release-shield]: https://img.shields.io/github/v/release/sailpoint-oss/colab-identitynow-management?label=Current%20Release
[release-url]: https://github.com/sailpoint-oss/colab-identitynow-management/releases
[contributor-shield]: https://img.shields.io/github/contributors/sailpoint-oss/colab-identitynow-management?label=Contributors
[contributors-url]: https://github.com/sailpoint-oss/colab-identitynow-management/graphs/contributors

# IdentityNow Management Loopback SaaS Connector

---

Loopback connector to manage IdentityNow like any other managed system. Allows to manage user levels, governance groups and lifecycle states.

## Features:

-   **User levels**: when enabled, the connector manages user levels as entitlements. It aggregates all identities with a user level different from User or every single one if _Aggregate all identities regardless of their user level?_ option is enabled.
-   **Governance groups**: when enabled, the connector manages governance groups as entitlements.
-   **Lifecycle states**: when enabled, the connector manages lifecycle states as entitlements. Each different lifecycle state in the system generates an entitlement that can be assigned to an identity. Lifecycle state entitlements removals do nothing, they're only there to be assigned by request. Assigning a lifecycle state from an identity profile different from the target identity's one does nothing. The idea behind lifecycle states entitlements is bundling equivalent ones into access profiles, like _A - inactive_, _B - inactive_ entitlements into _inactive_ access profile and assign the access profile by request. The connector will only apply the matching LCS. Do not use this feature with roles or with entitlements directly.
-   **Enable/disable account**: identity enable/disable is supported. This is often used in lifecycle states like leaver in combination with the _Aggregate all identities regardless their user level?_ option. Just enable the option and configure your lifecycle state to disable the account, which in turn disables the identity.

## Installation:

-   Run `npm install` to download all project dependencies
-   Follow the instructions here to pack the connector zip and upload it to your tenant: https://developer.sailpoint.com/idn/docs/saas-connectivity/test-build-deploy

## Changelog:

-   2.1.5:
    -   General library update
-   2.1.4:
    -   Performance enhancements
-   2.1.3:
    -   Added extensive logging for better debugging
-   2.1.2:
    -   Removed option to remove entitlements when account is disabled. There are better ways of doing this outside the scope of the connector.
    -   Added option to aggregate all identities regardless of their user level. See features section for explanation.

---

[Explore the docs »](https://developer.sailpoint.com/discuss/t/identitynow-management-saas-connector/18175)

[New to the CoLab? Click here »](https://developer.sailpoint.com/discuss/t/about-the-sailpoint-developer-community-colab/11230)

<!-- CONTRIBUTING -->

## Contributing

Contributions are what make the open source community such an amazing place to learn, inspire, and create. Any contributions you make are **greatly appreciated**.

If you have a suggestion that would make this better, please fork the repo and create a pull request. You can also simply open an issue with the tag `enhancement`.
Don't forget to give the project a star! Thanks again!

1. Fork the Project
2. Create your Feature Branch (`git checkout -b feature/AmazingFeature`)
3. Commit your Changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the Branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

<!-- LICENSE -->

## License

Distributed under the MIT License. See `LICENSE.txt` for more information.

<!-- CONTACT -->

## Discuss

[Click Here](https://developer.sailpoint.com/discuss/new-topic?title=Your%20CoLab%20question%20title&body=Your%20CoLab%20question%20body%20here&category_id=2&tags=colab) to discuss the Colab with other users.
