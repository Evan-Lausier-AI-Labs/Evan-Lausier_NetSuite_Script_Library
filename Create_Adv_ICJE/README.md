# Create_Adv_ICJE

A SuiteScript 2.1 solution for automatically creating Advanced Intercompany Journal Entries (ICJE) from Vendor Bill expense lines when subsidiaries differ.

## Overview

This solution automates the creation of Advanced Intercompany Journal Entries when a Vendor Bill contains expense lines allocated to different subsidiaries than the bill's primary subsidiary. The User Event script triggers on Vendor Bill create/edit and invokes a Map/Reduce script to handle the ICJE creation process asynchronously.

## How It Works

1. **Vendor Bill Saved**: When a Vendor Bill is created or edited, the User Event script fires
2. 2. **MR Script Triggered**: The UE script triggers the Map/Reduce script, passing the Vendor Bill ID
   3. 3. **Expense Line Analysis**: The MR script analyzes each expense line's custom segment entity
      4. 4. **Subsidiary Comparison**: Compares the expense entity's subsidiary against the VB subsidiary
         5. 5. **ICJE Creation**: For mismatched subsidiaries, creates balanced ICJE entries with proper due-to/due-from relationships
           
            6. ## Script Details
           
            7. | Property | Value |
            8. |----------|-------|
            9. | Script Types | User Event + Map/Reduce |
            10. | API Version | 2.1 |
            11. | Deployment | Vendor Bill record |
            12. | Author | Puja Roy |
            13. | Created | August 2025 |
           
            14. ## Files Included
           
            15. | File | Type | Description |
            16. |------|------|-------------|
            17. | `gtf_ue_create_adv_icje.js` | User Event | Triggers MR script on VB create/edit |
            18. | `gtf_mr_create_adv_icje.js` | Map/Reduce | Creates Advanced ICJE records |
           
            19. ## Script IDs & Parameters
           
            20. ### User Event Script
            21. - **Script ID**: `customscript_gtf_ue_create_adv_icje`
               
                - ### Map/Reduce Script
                - - **Script ID**: `customscript_gtf_mr_create_adv_icje`
                  - - **Parameters**:
                    -   - `custscript_gtf_mr_vb_id` - Vendor Bill internal ID (passed from UE)
                        -   - `custscript_mr_vb_distribution_search_id` - Optional saved search ID for batch processing
                         
                            - ## Required Modules
                         
                            - - `N/task` - Task scheduling for triggering MR script
                              - - `N/log` - Logging functionality
                                - - `N/record` - Record operations (load, create, submit)
                                  - - `N/search` - Saved search operations
                                    - - `N/runtime` - Script parameters and runtime context
                                     
                                      - ## Custom Records & Fields
                                     
                                      - ### Custom Segment
                                      - - `customrecord_cseg_gtf_exp_entity` - Expense Entity custom record
                                        - - `custrecord_gtf_subsidiary_ext_id` - Subsidiary External ID field on expense entity
                                         
                                          - ### Custom Body Fields
                                          - - `custbody_gtf_linked_icje` - Links created ICJE to source Vendor Bill
                                            - - `custbody_gtf_journal_entry_type` - Journal Entry type classification
                                             
                                              - ### Custom Segment on Lines
                                              - - `cseg_gtf_exp_entity` - Expense Entity segment on expense lines
                                                - - `cseg_coa` - Chart of Accounts segment
                                                 
                                                  - ## Account Configuration
                                                 
                                                  - The script uses the following account internal IDs (configurable):
                                                  - - **AP Account**: 721 (or 349 for 4-digit accounts)
                                                    - - **AR Account**: 245 (or 349 for 4-digit accounts)
                                                     
                                                      - ## Journal Entry Structure
                                                     
                                                      - For each expense line with a different subsidiary, the script creates 4 balanced lines:
                                                     
                                                      - | Line | Subsidiary |#  ACcrceoautnet_ A|d vD_eIbCiJtE
                                                      - |
                                                      -  AC rSeudiitte S|c rDiupet  T2o./1F rsooml u|t
                                                      -  i|o-n- -f-o-r- |a-u-t-o-m-a-t-i-c-a-l-l-y| -c-r-e-a-t-i-n-g- |A-d-v-a-n-c-e-d| -I-n-t-e-r-c-o-m|p-a-n-y- -J-o-u-r-n-a-l- -E|n
                                                      -  t|r i1e s|  (VIBC JSEu)b sfirdoima rVye n|d oArR  BAiclclo uenxtp e|n sAem oluinnte s|  w-h e|n  Esxupbesnisdei aErniteist yd iSfufbe r|.
                                                     
                                                      -  |
                                                      -   #2#  |O vVeBr vSiuebws
                                                      -   i
                                                      -   dTihairsy  s|o lEuxtpieonns ea uAtcocmoautnets  |t h-e  |c rAemaotuinotn  |o f-  A|d
                                                      -   v|a n3c e|d  EIxnpteenrsceo mEpnatniyt yJ oSuurbn a|l  EExnpternisees  Awchceonu nat  V|e nAdmooru nBti l|l  -c o|n t-a i|n
                                                      -   s|  e4x p|e nEsxep elnisnee sE natliltoyc aStuebd  |t oA Pd iAfcfceoruenntt  |s u-b s|i dAimaoruinets  |t hVaBn  Stuhbes ibdiilalr'ys  |p
                                                      -   r
                                                      -   i#m#a rDye psluobysmiednita rNyo.t eTsh
                                                      -   e
                                                      -    1U.s eDre pElvoeyn tU ssecrr iEpvte nttr isgcgreirpst  otno  VVeennddoorr  BBiillll  crreecaotred/ etdyipte
                                                      -    a2n.d  Sientv oekxeesc uat iMoanp /cRoendtuecxet  stcor i`patf tteor Shuabnmdilte`  tohne  `IcCrJeEa tcer`e aatnido n` epdriotc`e sesv eanstysn
                                                      -    c3h.r oEnnosuusrley .M
                                                      -    a
                                                      -    p#/#R eHdouwc eI ts cWroirpkts
                                                      -    i
                                                      -    s1 .d e*p*lVoeyneddo ra nBdi lalv aSialvaebdl*e*
                                                      -    :4 .W hCeonn fai gVuerned osrc rBiipltl  piasr acmreetaetresd  aosr  needeidteedd ,f otrh eb aUtscehr  pErvoecnets ssicnrgipt fires
                                                      -    2. **MR Script Triggered**: The UE script triggers the Map/Reduce script, passing the Vendor Bill ID
                                                           3. 3. **Expense Line Analysis**: The MR script analyzes each expense line's custom segment entity
                                                              4. 4. **Subsidiary Comparison**: Compares the expense entity's subsidiary against the VB subsidiary
                                                                 5. 5. **ICJE Creation**: For mismatched subsidiaries, creates balanced ICJE entries with proper due-to/due-from relationships
                                                                   
                                                                    6. ## Script Details
                                                                   
                                                                    7. | Property | Value |
                                                                    8. |----------|-------|
                                                                    9. | Script Types | User Event + Map/Reduce |
                                                                    10. | API Version | 2.1 |
                                                                    11. | Deployment | Vendor Bill record |
                                                                    12. | Author | Puja Roy |
                                                                    13. | Created | August 2025 |
                                                                   
                                                                    14. ## Files Included
                                                                   
                                                                    15. | File | Type | Description |
                                                                    16. |------|------|-------------|
                                                                    17. | `gtf_ue_create_adv_icje.js` | User Event | Triggers MR script on VB create/edit |
                                                                    18. | `gtf_mr_create_adv_icje.js` | Map/Reduce | Creates Advanced ICJE records |
                                                                   
                                                                    19. ## Script IDs & Parameters
                                                                   
                                                                    20. ### User Event Script
                                                                    21. - **Script ID**: `customscript_gtf_ue_create_adv_icje`
                                                                       
                                                                        - ### Map/Reduce Script
                                                                        - - **Script ID**: `customscript_gtf_mr_create_adv_icje`
                                                                          - - **Parameters**:
                                                                            -   - `custscript_gtf_mr_vb_id` - Vendor Bill internal ID (passed from UE)
                                                                                -   - `custscript_mr_vb_distribution_search_id` - Optional saved search ID for batch processing
                                                                                 
                                                                                    - ## Required Modules
                                                                                 
                                                                                    - - `N/task` - Task scheduling for triggering MR script
                                                                                      - - `N/log` - Logging functionality
                                                                                        - - `N/record` - Record operations (load, create, submit)
                                                                                          - - `N/search` - Saved search operations
                                                                                            - - `N/runtime` - Script parameters and runtime context
                                                                                             
                                                                                              - ## Custom Records & Fields
                                                                                             
                                                                                              - ### Custom Segment
                                                                                              - - `customrecord_cseg_gtf_exp_entity` - Expense Entity custom record
                                                                                                - - `custrecord_gtf_subsidiary_ext_id` - Subsidiary External ID field on expense entity
                                                                                                 
                                                                                                  - ### Custom Body Fields
                                                                                                  - - `custbody_gtf_linked_icje` - Links created ICJE to source Vendor Bill
                                                                                                    - - `custbody_gtf_journal_entry_type` - Journal Entry type classification
                                                                                                     
                                                                                                      - ### Custom Segment on Lines
                                                                                                      - - `cseg_gtf_exp_entity` - Expense Entity segment on expense lines
                                                                                                        - - `cseg_coa` - Chart of Accounts segment
                                                                                                         
                                                                                                          - ## Account Configuration
                                                                                                         
                                                                                                          - The script uses the following account internal IDs (configurable):
                                                                                                          - - **AP Account**: 721 (or 349 for 4-digit accounts)
                                                                                                            - - **AR Account**: 245 (or 349 for 4-digit accounts)
                                                                                                             
                                                                                                              - ## Journal Entry Structure
                                                                                                             
                                                                                                              - For each expense line with a different subsidiary, the script creates 4 balanced lines:
                                                                                                             
                                                                                                              - | Line | Subsidiary | Account | Debit | Credit | Due To/From |
                                                                                                              - |------|------------|---------|-------|--------|-------------|
                                                                                                              - | 1 | VB Subsidiary | AR Account | Amount | - | Expense Entity Sub |
                                                                                                              - | 2 | VB Subsidiary | Expense Account | - | Amount | - |
                                                                                                              - | 3 | Expense Entity Sub | Expense Account | Amount | - | - |
                                                                                                              - | 4 | Expense Entity Sub | AP Account | - | Amount | VB Subsidiary |
                                                                                                             
                                                                                                              - ## Deployment Notes
                                                                                                             
                                                                                                              - 1. Deploy User Event script to Vendor Bill record type
                                                                                                                2. 2. Set execution context to `afterSubmit` on `create` and `edit` events
                                                                                                                   3. 3. Ensure Map/Reduce script is deployed and available
                                                                                                                      4. 4. Configure script parameters as needed for batch processing
