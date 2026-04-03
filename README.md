# Evan-Lausier_NetSuite_Script_Library

Evan Lausier's library of NetSuite SuiteScript solutions covering transactions, integrations, validations, and automation — primarily for GoTo Foods (GTF) and related engagements.

## Structure

Each script is organized in its own folder. Folders named `gtf_*` are GTF-specific; others are general-purpose or reusable patterns.

## Scripts

| Script | Type | Version | Description |
|--------|------|---------|-------------|
| [AP_Send_Email_Invoice](./AP_Send_Email_Invoice) | Map/Reduce | 2.x | Automatically send invoice emails with PDF attachments and error handling |
| [Auto_Billing](./Auto_Billing) | Map/Reduce | 2.1 | Transform Sales Orders to Invoices automatically |
| [Auto_Email_Invoice](./Auto_Email_Invoice) | Map/Reduce | 2.x | Email invoices with PDF attachments |
| [Batch_Field_Update](./Batch_Field_Update) | Scheduled | 1.0 | Batch update field values on multiple records with governance management |
| [Consolidation_Script](./Consolidation_Script) | User Event | 2.x | Consolidate Sales Order lines by location, time slot, and Prop 65 |
| [Create_Adv_ICJE](./Create_Adv_ICJE) | User Event + Map/Reduce | 2.1 | Auto-create Advanced Intercompany Journal Entries from Vendor Bill expense lines |
| [Create_Royalty_Invoice](./Create_Royalty_Invoice) | Map/Reduce | 2.1 | Create franchise royalty invoices from sales data (see folder README) |
| [External_ID_Update](./External_ID_Update) | User Event | 2.0 | Update Employee External ID based on custom email field |
| [Field_Protect](./Field_Protect) | Client | 1.0 | Role-based field protection on transactions |
| [Forced_Error](./Forced_Error) | User Event | 2.x | Force errors for integration flow testing |
| [HTTPS_Multipart_Upload](./HTTPS_Multipart_Upload) | Module | 2.x | Multipart/form-data file uploads via HTTPS |
| [ICJE_Provider_Update](./ICJE_Provider_Update) | Map/Reduce | 2.1 | Bulk update Intercompany Journal Entry provider field across existing ICJE records |
| [Invoice_Grouping](./Invoice_Grouping) | User Event | 2.x | Group invoice lines by project for printing |
| [Invoice_Line_Deletion](./Invoice_Line_Deletion) | Map/Reduce | 2.1 | Bulk removal of duplicate or unwanted lines from invoices with dry run support |
| [JE_CSV_Validation](./JE_CSV_Validation) | User Event | 1.0 | Validate Journal Entry lines during CSV import |
| [JE_Line_Validation](./JE_Line_Validation) | Client | 1.0 | Real-time JE line validation based on account classification |
| [NACHA_Regions_Templates](./NACHA_Regions_Templates) | FreeMarker | 1.x | Payment Manager FreeMarker templates for Regions Bank ACH (templates 170/171) |
| [NACHA_WellsFargo_Templates](./NACHA_WellsFargo_Templates) | FreeMarker | 1.x | Payment Manager FreeMarker templates for Wells Fargo ACH DD and EFT (templates 167/168) |
| [OneStream](./OneStream) | RESTlet | 2.1 | GTF OneStream integration RESTlet (`gtf_rl_onestream_v2.js`) — serves GL, balance sheet, and synthetic RE roll-forward data to OneStream for financial consolidation |
| [PO_Item_Image](./PO_Item_Image) | User Event | 1.0 | Populate item thumbnail images on Purchase Order lines |
| [PreNotif_Payment_Drafts_Suitelet](./PreNotif_Payment_Drafts_Suitelet) | Suitelet | 2.1 | GTF pre-notification franchise payment drafts UI — filters invoices by saved search, supports per-row EFT type selection, CSV export, and direct Customer Payment creation via `record.transform` |
| [Royalty_Invoice_Script](./Royalty_Invoice_Script) | Map/Reduce | 2.1 | GTF franchise royalty billing Map/Reduce script (`gtf_mr_create_invoice_1_4`) — creates invoices from FCRM franchise sales data |
| [Royalty_Invoice_Suitelet](./Royalty_Invoice_Suitelet) | Suitelet | 2.1 | UI for selecting and creating royalty invoices |
| [Salesforce_ID_Customer_Refunds](./Salesforce_ID_Customer_Refunds) | Client | 1.0 | Sync Salesforce IDs on customer refund transactions |
| [Saved_Search_To_File_Cabinet](./Saved_Search_To_File_Cabinet) | Suitelet/Scheduled | 1.0 | Export saved search results to CSV in File Cabinet |
| [SFTP_Transfer](./SFTP_Transfer) | Scheduled | 2.x | SFTP file uploads and downloads |
| [SFTP_Upload_Suitelet](./SFTP_Upload_Suitelet) | Suitelet | 1.0 | Secure file transfer uploads via SFTP with folder selection |
| [SKU_Generator](./SKU_Generator) | User Event | 2.0 | Auto-generate SKU numbers for items |
| [Split_Line_Integration](./Split_Line_Integration) | Integration | 2.x | Split fulfillment line items for Enlinx/Celigo integration |
| [SuiteQL_Query_Tool](./SuiteQL_Query_Tool) | Suitelet | 2.x | Interactive SuiteQL query execution with results export and query management |
| [Update_SO_3PL_Line](./Update_SO_3PL_Line) | User Event | 2.x | Update Sales Order lines with 3PL response status |
| [Workflow_Trigger_Suitelet](./Workflow_Trigger_Suitelet) | Suitelet | 1.0 | Trigger workflow actions on Journal entries |

## Script Types

- **Map/Reduce** — High-volume batch processing with governance management
- **User Event** — Record-level automation (beforeLoad, beforeSubmit, afterSubmit)
- **Client** — Browser-side validation and UI enhancements
- **Suitelet** — Custom UI pages and web services
- **RESTlet** — REST API endpoints for external system integration
- **Scheduled** — Time-based or on-demand background processing
- **Integration** — Scripts for Celigo or other middleware platforms
- **FreeMarker** — Payment Manager file format templates
- **Module** — Reusable library modules

## Technologies

- SuiteScript 2.1 and 2.x (N/query, N/record, N/search, N/email, N/sftp, N/file, N/render)
- SuiteScript 1.0 (legacy scripts)
- FreeMarker templates (Payment Manager bundle 2663)
- Celigo integrator.io

## Author

Evan Lausier — [Evan-Lausier-AI-Labs](https://github.com/Evan-Lausier-AI-Labs)
