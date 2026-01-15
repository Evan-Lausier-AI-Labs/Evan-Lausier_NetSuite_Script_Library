# Create_Royalty_Invoice

A SuiteScript 2.1 Suitelet and Client Script combination for selecting franchise sales data and creating royalty invoices in NetSuite.

## Overview

The Create Royalty Invoice solution provides a user interface for franchisors to review sales data from franchisees and generate royalty invoices based on selected records. The system uses a Map/Reduce script (triggered separately) to process large volumes of invoice creation efficiently.

## Features

- **Sales Data Selection** - Filter and select franchise sales records for invoice generation
- **Multiple Filter Options** - Filter by Franchisee, Store Number, Brand, Date Range
- **Bulk Processing** - Select multiple sales data lines for batch invoice creation
- **Map/Reduce Integration** - Leverages Map/Reduce script for high-volume processing
- **Cache-Based Data Transfer** - Uses N/cache module to pass data between scripts
- **Dynamic URL Parameters** - Filters persist via URL parameters for page reloads

## Scripts Included

### gtf_sl_createroyaltyinvoice.js (Suitelet)

| Property | Value |
|----------|-------|
| **Script Type** | Suitelet |
| **API Version** | 2.1 |
| **Module Scope** | SameAccount |

**Purpose:** Creates the user interface for selecting sales data and triggers the invoice creation process.

### gtf_cs_createinvoiceroyalty.js (Client Script)

| Property | Value |
|----------|-------|
| **Script Type** | Client Script |
| **API Version** | 2.1 |

**Purpose:** Handles client-side interactions including field changes, validation, and navigation.

## Required Modules

### Suitelet
- N/redirect, N/ui/serverWidget, N/search, N/runtime, N/cache, N/format

### Client Script
- N/currentRecord, N/runtime, N/ui/dialog, N/url, N/error, N/format, N/search

## Installation

1. Upload both script files to NetSuite
2. Create Suitelet Script Record with parameters for Client Script and Map/Reduce Script IDs
3. Create Client Script Record
4. Deploy the Suitelet with appropriate roles

## Version History

| Date | Author | Changes |
|------|--------|---------|
| 2022 | Oracle | Initial version |
