KKM LEGACY CARD TRACKER
=======================

Purpose
-------
A lightweight offline browser app for logging legacy Pokémon cards while physically sorting them.

Current assumptions
-------------------
- Legacy cards default to $0.00 basis unless you have supportable acquisition records.
- One row can represent multiple identical copies using Quantity.
- Data is stored in your browser's localStorage.
- Export JSON regularly as your durable backup.
- CSV export is included for spreadsheets/accounting review.

How to run
----------
1. Extract this folder somewhere permanent.
2. Double-click index.html.
3. Start logging.
4. Export JSON backups regularly.

Future expansion
----------------
This is intentionally structured so we can later add:
- modern set imports
- purchase/rip lots
- automatic cost allocation
- per-card lifecycle/history
- FIFO handling
- TCGplayer/Etsy status and sales
- magnet production/orders
- reports / COGS / P&L
- National Dex collection views

Important
---------
Browser localStorage belongs to that browser/profile/device. Use Export JSON often.
