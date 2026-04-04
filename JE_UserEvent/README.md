# JE_UserEvent

**Script:** `gtf_ue_journals.js`  
**Type:** User Event Script (2.1)  
**Applies to:** Journal Entry  

## What it does

- **beforeLoad** – sets the COA segment column to display-only
- **beforeSubmit** – reads account and department IDs from all JE lines, looks up brand and COA segment mappings, auto-populates `class` (brand) and `cseg_coa`, enforces dept/fund/name required flags per account configuration

## Custom fields referenced

| Record | Field ID | Purpose |
|---|---|---|
| Account | `custrecord_gtf_coa_brand` | Brand derived from account |
| Account | `cseg_coa` | COA segment |
| Account | `custrecord_gtf_deptreqflag` | Department required flag |
| Account | `custrecord_gtf_preventfund` | Fund must be blank flag |
| Account | `custrecord_gtf_namereqflag` | Entity/name required flag |
| Account | `custrecord_gtf_adfundinterco` | Ad fund interco flag (sets fund = 311) |
| Account | `custrecord_gtf_preventje` | Manual JE prevention flag (currently unused) |
| Department | `custrecord_deptbrand` | Brand derived from department |

## Known issue / diagnosis

As of April 2026, `getDepartmentsDetails` throws `SSS_SEARCH_ERROR_OCCURRED` on JEs belonging to subsidiaries 21 (Cinnabon LLC), 27 (Cinnabon SPV), and 28 (Auntie Anne's SPV). The fix adds:

1. **Param sanitization** – filters `deptIds` to valid integers before binding to the parameterized query, preventing bad values from reaching the query engine
2. **Diagnostic logging** – logs raw and sanitized `deptIds` at DEBUG level before execution so the root cause is visible in the NetSuite execution log
3. **Graceful fallback** – wraps the query in a try/catch; on failure, logs full error detail and returns `{}` so the JE save is not blocked

If the root cause is `custrecord_deptbrand` having subsidiary restrictions that exclude subs 21/27/28, the config fix is to remove those restrictions from the custom field definition in Setup > Customization > Other Custom Fields.
