# Evan-Lausier_NetSuite_Script_Library
Evan Lausier has created a comprehensive library of NetSuite SuiteScript solutions covering transactions, integrations, validations, and automation.

## Structure
Each script is organized in its own folder with a README describing its purpose and usage.

## Scripts

| Script | Type | Version | Description |
|--------|------|---------|-------------|
| [AP_Send_Email_Invoice](./AP_Send_Email_Invoice) | Map/Reduce | 2.x | Automatically send invoice emails with PDF attachments and error handling |
| [Auto_Billing](./Auto_Billing) | Map/Reduce | 2.1 | Transform Sales Orders to Invoices automatically |
| [Auto_Email_Invoice](./Auto_Email_Invoice) | Map/Reduce | 2.x | Email invoices with PDF attachments |
| [Batch_Field_Update](./Batch_Field_Update) | Scheduled | 1.0 | Batch update field values on multiple records with governance management |
| [Consolidation_Script](./Consolidation_Script) | User Event | 2.x | Consolidate Sales Order lines by location, time slot, and Prop 65 |
| [Create_Adv_ICJE](./Create_Adv_ICJE) | User Event + Map/Reduce | 2.1 | Auto-create Advanced Intercompany Journal Entries from Vendor Bill expense lines |
| [External_ID_Update](./External_ID_Update) | User Event | 2.0 | Update Employee External ID based on custom email field |
| [Field_Protect](./Field_Protect) | Client | 1.0 | Role-based field protection on transactions |
| [Forced_Error](./Forced_Error) | User Event | 2.x | Force errors for integration flow testing |
| [HTTPS_Multipart_Upload](./HTTPS_Multipart_Upload) | Module | 2.x | Multipart/form-data file uploads via HTTPS |
| [Invoice_Grouping](./Invoice_Grouping) | User Event | 2.x | Group invoice lines by project for printing |
| [JE_CSV_Validation](./JE_CSV_Validation) | User Event | 1.0 | Validate Journal Entry lines during CSV import |
| [JE_Line_Validation](./JE_Line_Validation) | Client | 1.0 | Real-time JE line validation based on account classification |
| [PO_Item_Image](./PO_Item_Image) | User Event | 1.0 | Populate item thumbnail images on Purchase Order lines |
| [Royalty_Invoice_Script](./Royalty_Invoice_Script) | Map/Reduce | 2.1 | Create franchise royalty invoices from sales data |
| [Royalty_Invoice_Suitelet](./Royalty_Invoice_Suitelet) | Suitelet | 2.1 | UI for selecting and creating royalty invoices |
| [Salesforce_ID_Customer_Refunds](./Salesforce_ID_Customer_Refunds) | Client | 1.0 | Sync Salesforce IDs on customer refund transactions |
| [Saved_Search_To_File_Cabinet](./Saved_Search_To_File_Cabinet) | Suitelet/Scheduled | 1.0 | Export saved search results to CSV in File Cabinet |
| [SFTP_Transfer](./SFTP_Transfer) | Scheduled | 2.x | SFTP file uploads and downloads |
| [SFTP_Upload_Suitelet](./SFTP_Upload_Suitelet) | Suitelet | 1.0 | Secure file transfer uploads via SFTP with folder selection |
| [SKU_Generator](./SKU_Generator) | User Event | 2.0 | Auto-generate SKU numbers for items |
| [SuiteQL_Query_Tool](./SuiteQL_Query_Tool) | Suitelet | 2.x | Interactive SuiteQL query execution with results export and query management |
| [Split_Line_Integration](./Split_Line_Integration) | Integration | 2.x | Split fulfillment line items for Enlinx/Celigo integration |
| [Update_SO_3PL_Line](./Update_SO_3PL_Line) | User Event | 2.x | Update Sales Order lines with 3PL response status |
| [Workflow_Trigger_Suitelet](./Workflow_Trigger_Suitelet) | Suitelet | 1.0 | Trigger workflow actions on Journal entries |

## Script Types

- **Map/Reduce** - High-volume batch processing with governance management
- **User Event** - Record-level automation (beforeLoad, beforeSubmit, afterSubmit)
- **Client** - Browser-side validation and UI enhancements
- **Suitelet** - Custom UI pages and web services
- **Scheduled** - Time-based or on-demand background processing
- **Integration** - Scripts for Celigo or other middleware platforms
- **Module** - Reusable library modules

## Technologies

- SuiteScript 1.0 and 2.x
- N/search, N/record, N/email, N/sftp, N/file, N/render
- FreeMarker templates
- Celigo integrator.io

## Author
Evan Lausier - [Evan-Lausier-AI-Labs](https://github.com/Evan-Lausier-AI-Labs)
