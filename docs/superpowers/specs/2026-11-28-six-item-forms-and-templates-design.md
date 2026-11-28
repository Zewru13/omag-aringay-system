# Six requests: import templates, cooperative wizard, sign-in email, Tax Dec, saved "Other" values, machinery in Add Farm Parcels

The user asked for these on 2026-11-28 and approved this design and the suggested choices ("Proceed"). No new database tables or columns.

## Delivery

Separate pull requests, in this order; each is tested on the throwaway copy, and the user is asked before commit and merge:

1. Items 3 and 4  2. Item 1  3. Item 5  4. Item 6  5. Item 2  6. Help text and pictures, all at once

Help may be out of date until step 6.

## Item 3. Email on the sign-in page

`agriculture2503aringay@gmail.com` as a clickable email below the "No account yet, or the reset email does not arrive?" note. Only this address
(the second one in `OFFICE_CONTACT` stays in Help > About only).

## Item 4. No Tax Dec for Tenant and Lessee

- When Land Ownership is Tenant or Lessee, **Tax Dec No.** is not asked for in Add Farm Parcels or Edit Parcel, and is not shown in the review
  step, the parcel view window or the printed parcel report.
- New tenant and lessee parcels are saved without one, imports included (a number in the file is ignored for those rows).
- **A number already saved stays in the database; it is only hidden.** Nothing deletes it, an edit of the parcel included.
- Owner parcels are unchanged.

## Item 1. Sample fill-up in every import template

Row 1 a banner, "SAMPLE FILL-UP ONLY: the yellow row is an example and won't be imported"; row 2 how to fill this in; row 3 column headings;
row 4 the example row in yellow with an Excel comment saying it is a sample; row 5 onward the user's records.
Every import template, the farmer / fisherfolk registry (RSBSA) one included (its importer must find the heading row and skip the sample, and must
still accept the raw export whose headings are on row 1). An unchanged sample is skipped; a sample row typed over counts as the user's record.
Files made with the old templates still import.

## Item 5. A typed "Other" variety or seed source is saved to the lists

- On saving a crop, a new typed value is added to Crop Settings (a variety under its crop; a seed source in the seed source list) and so appears
  in the dropdowns. A different capitalization or spacing uses the existing entry. Typos are saved too and are fixed in Crop Settings.
- Done in one place on the server, so every way of saving a crop is covered, file imports included.
- Edit Crop uses the same lists as Add Crop (today: Variety is a plain box, Seed Source a fixed list). A crop's current value stays selectable.

## Item 6. Machinery in Add Farm Parcels

Steps: Parcel Details → Add Crops → Add Machinery (optional) → Review and Save. The step shows what the farmer already has. The machinery is the
farmer's (`FarmerMachinery`) and is saved together with the parcels, all or nothing. Register Farmer and the farmer's profile keep their machinery.

## Item 2. Add Cooperative as a wizard

Steps: Details → Equipment → Members → Review and Save. Equipment and members stay optional, file import included. Both kinds of cooperative.
Everything is saved at the end.

## Approaches considered

- Templates: a separate instructions sheet (easy to miss) against rows on the sheet itself (chosen).
- Cooperative form: three steps without a review (shorter, no final check) against four with a review (chosen, like Add Farm Parcels).
- "Other" values: saved by each screen (imports would be missed) against one place on the server (chosen).
