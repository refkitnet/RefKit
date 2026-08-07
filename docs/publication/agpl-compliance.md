# AGPL Corresponding Source guidance

This page is practical project guidance, not legal advice. Read the complete [AGPL-3.0-only license](../../LICENSE) and obtain legal advice for your circumstances.

## Network use of modified RefKit

If you modify AGPL-covered RefKit software and let users interact with that modified version over a network, section 13 of the AGPL may require you to offer those users the Corresponding Source of the version they use.

For RefKit, a complete source offer should account for:

- the exact deployed application source revision and your modifications;
- applicable shared source, dependency declarations, and lockfiles;
- build and generation scripts;
- database schema and migration materials;
- container and deployment definitions; and
- installation information and other material required by the AGPL's definition of Corresponding Source.

Do not point users at an official RefKit tag if your running version contains modifications not present in that tag. Do not omit a private build, migration, or generation component that is needed to produce the running covered work.

## Operator checklist

- [ ] Identify the exact source revision in the running build.
- [ ] Preserve copyright, license, and attribution notices.
- [ ] Provide a prominent source link or offer to network users of the modified version.
- [ ] Ensure the offered source matches the running covered version and includes your changes.
- [ ] Include the materials needed to build, migrate, install, and run that version as required by the license.
- [ ] Keep the source offer available for as long as the license requires.
- [ ] Apply a distinct name and visual identity to a materially modified distribution under [TRADEMARKS.md](../../TRADEMARKS.md).

Using an unmodified official image does not grant additional trademark rights and does not remove obligations created by other software you combine or distribute.

The official container build requires an exact revision and browsable source
root. Running instances expose these values through `/api/health/live` and
link the applicable source and notices through `/api/legal`. Fork operators
must keep those build arguments pointed at their own complete public source.

## RefKit Cloud policy

RefKit Cloud must publish the complete Corresponding Source for each deployed AGPL-covered revision no later than deployment. The running build must identify the revision and give network users access to the applicable source and notices. Release automation and deployment records must make the Cloud revision traceable to public source.

This is a release gate. It is not evidence that any current unverified deployment already complies.
