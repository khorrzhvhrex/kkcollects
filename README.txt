KKM CARD TRACKER — v0.3
=======================

Purpose
-------
A local-first Pokémon card inventory tracker built for collection management,
future KKM sales workflows, and per-card physical printing identification.

Runtime architecture
--------------------
The deployed site has zero external card-data dependencies.

The browser reads only files committed in this repository:

- data/sets-index.js
- data/sets/*.js
- data/pokedex.js
- data/source-info.json

Card images are intentionally excluded for now.

Updating local card data
------------------------
The repository is designed to be maintained entirely through GitHub's browser UI.

1. Open the repository.
2. Click Actions.
3. Open "Update local card data".
4. Click "Run workflow".
5. The Action clones the current open TCGdex cards database, builds a compact
   normalized snapshot, and commits changed /data files back into this repo.

The live application never contacts TCGdex.

Physical printing model
-----------------------
The source importer preserves useful physical-card distinctions when available:

- treatment:
  - Standard
  - Holo
  - Reverse Holo
  - Cosmos Holo
  - Other

- size:
  - Standard
  - Oversized

- edition:
  - Unlimited
  - 1st Edition

- special physical printing metadata:
  - foil family
  - subtype (Shadowless, copyright variants, errors, etc.)
  - stamps / markings
  - language restrictions
  - source variant type (including metal / lenticular)
  - TCGplayer variant ID when supplied upstream

The app presents only the relevant options for a selected card whenever the
source data is precise enough. "Other" remains available as a manual escape hatch
and requires Notes.

Secret rares
------------
Printed set count is never treated as a card-number ceiling.

Example:
Dark Raichu 83/82 is valid.

Promos
------
Imported promo sets are treated as normal checklist sets when present.
Manual / Promo Entry remains available for missing, unnumbered, unusual, or
incorrect source records.

Inventory history
-----------------
A quantity of 0 does NOT delete an inventory record.

Zero-quantity records:
- remain stored
- are hidden from normal inventory
- appear when "Show inactive" is enabled
- can be restored later

The tracker no longer uses destructive deletion for ordinary inventory movement.

Local storage
-------------
Inventory is still stored in browser localStorage at this stage.
Export JSON regularly as the durable backup.

Storage key:
kkmCardTracker_v3

The app automatically migrates:
- kkmCardTracker_v2
- kkmLegacyTracker_v1

Future work
-----------
- purchase / rip lots
- per-card acquisition basis
- FIFO / specific identification workflows
- disposition event history
- TCGplayer listings / sales
- Etsy magnet production / custom orders
- COGS and P&L reporting
- National Dex collection view
- optional card-image retrieval and caching
