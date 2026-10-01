KKM CARD TRACKER
================

Purpose
-------
A local-first browser app for tracking Pokémon cards while sorting, collecting,
selling, and eventually supporting KKM business workflows.

Core principles
---------------
- Runtime card/set/Pokédex metadata is stored in the GitHub repo.
- The deployed app does not contact TCGdex, PokéAPI, or another card database.
- Third-party sources are maintenance inputs only.
- Card images are intentionally not included yet.
- Imported set data accelerates entry but never prevents manual entry.
- Secret rares are valid even when numerator > printed set denominator
  (for example Dark Raichu 83/82).
- Zero quantity never deletes a card record. It becomes inactive and is hidden
  by default.
- Legacy cards default to $0.00 basis unless supportable acquisition records exist.

Card model
----------
Set / Promo group
Printed card number
Card name
National Dex number
Language
Size:
  - Standard
  - Oversized
Treatment:
  - Standard
  - Holo
  - Reverse Holo
  - Cosmos Holo
  - Other
Condition
Quantity
Basis per card
Status
Storage location
Notes

If Treatment = Other, Notes are required.

Promos
------
Use imported promo sets when they exist. Otherwise choose "Manual / Promo Entry"
and enter the Set / Promo Group, card number, and name manually.

Local data maintenance
----------------------
This repo is designed for browser-only GitHub management.

To refresh set/card/Pokédex metadata:

1. Open the repo on GitHub.
2. Open Actions.
3. Choose "Update local card data".
4. Click "Run workflow".

The workflow runs tools/update_local_data.py and commits changed /data files
back to the repository.

Runtime files
-------------
data/pokedex.js
data/sets-index.js
data/sets/*.js
data/source-info.json

Backups
-------
Inventory remains in browser localStorage for this phase of the project.
Export JSON regularly as the durable backup.

Future architecture
-------------------
- purchase/rip lots
- automatic basis allocation
- FIFO consumption
- immutable lifecycle/disposition history
- TCGplayer/Etsy sales
- magnet production and custom orders
- reports / COGS / P&L
- National Dex collection views
- optional card image retrieval
