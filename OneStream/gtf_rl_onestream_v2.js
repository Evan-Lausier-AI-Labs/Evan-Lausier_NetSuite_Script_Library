/**
* @NApiVersion 2.1
* @NScriptType Restlet
*
* Fix (2026-03-14): Department/SBR CASE now treats custcol_gtf_legacyaxdept = 'NONE'
* as NULL instead of extracting first character 'N', which caused trial balance JE lines
* with no department to split across two rows ('N' and blank) rather than consolidating
* under a single NULL department group.
*
* Fix (2026-03-19): Added 'DeferRevenue' to balance sheet accttype list in OpeningBalance
* (x2) and YTDAmount (x1) CASE expressions. Without this, all 20 Deferred Revenue accounts
* (~$63.4M total balance) were incorrectly treated as income statement accounts, returning
* YTD-only activity instead of cumulative ending balances. Account 2055 example: was
* returning -$106,659.90 (2025 YTD only) instead of correct $220,521.30 (cumulative).
* Confirmed via full accttype audit: DeferRevenue is the only BS type missing from the list.
* Income, Expense, OthExpense, and COGS are correctly absent (IS accounts).
*/

define(['N/query', 'N/file', 'N/runtime', 'N/log'], (query, file, runtime, log) => {

  const buildSuiteQL = () => `
      SELECT 
        /* ---- Core grouping dimensions ---- */
        sub.externalid AS entity,
        MAX(sub.name) AS "Entity Entity Description",
        acc.acctnumber AS account,
        MAX(acc.fullname) AS "Account Account Description",
        CASE 
          WHEN d.name LIKE 'D%' THEN d.name
          WHEN d.name LIKE 'G%' THEN d.name
          WHEN t.type = 'Journal' AND tl.entity IS NULL 
            THEN CASE
              WHEN UPPER(BUILTIN.DF(tl.custcol_gtf_legacyaxdept)) IN ('NONE', 'N/A', '') THEN NULL
              ELSE SUBSTR(BUILTIN.DF(tl.custcol_gtf_legacyaxdept), 1, 1)
            END || d.name
          ELSE NVL(
            BUILTIN.DF(c_main.custentity_gtf_customer_account_type),
            NVL(
              BUILTIN.DF(c_line.custentity_gtf_customer_account_type),
              ''
            )
          ) || d.name
        END AS "Department/SBR",
        MAX(d.custrecord_deptdesc) AS "Department/SBR Department SBR Description",
        /* Fund */
        BUILTIN.DF(tl.cseg_fund) AS "Funds",
        /* Period - extract period number from parameter */
        TO_CHAR(TO_NUMBER(SUBSTR(?, 2, INSTR(?, ' ') - 2))) AS "Period",
        /* ---- Group text columns (collapsed with MAX) ---- */
        MAX(
          NVL(BUILTIN.DF(c_main.category), BUILTIN.DF(c_line.category))
        ) AS "Category",
        MAX(
          NVL(BUILTIN.DF(c_main.category), BUILTIN.DF(c_line.category))
        ) AS "Category Description",

        /* Rebate Vendors - grouping dimension */
        NVL(
          BUILTIN.DF(c_line.custentity_gtf_cu_fdrebatevend),
          NVL(
            BUILTIN.DF(c_main.custentity_gtf_cu_fdrebatevend),
            NVL(
              BUILTIN.DF(v_line.custentity_gtf_cu_fdrebatevend),
              BUILTIN.DF(v_main.custentity_gtf_cu_fdrebatevend)
            )
          )
        ) AS "Rebate Vendors",

        MAX(
          CASE 
            WHEN NVL(
              BUILTIN.DF(c_line.custentity_gtf_cu_fdrebatevend),
              NVL(
                BUILTIN.DF(c_main.custentity_gtf_cu_fdrebatevend),
                NVL(
                  BUILTIN.DF(v_line.custentity_gtf_cu_fdrebatevend),
                  BUILTIN.DF(v_main.custentity_gtf_cu_fdrebatevend)
                )
              )
            ) IS NOT NULL
            AND NVL(
              BUILTIN.DF(c_line.custentity_gtf_cu_fdrebatevend),
              NVL(
                BUILTIN.DF(c_main.custentity_gtf_cu_fdrebatevend),
                NVL(
                  BUILTIN.DF(v_line.custentity_gtf_cu_fdrebatevend),
                  BUILTIN.DF(v_main.custentity_gtf_cu_fdrebatevend)
                )
              )
            ) <> ''
            THEN NVL(c_line.companyname, NVL(c_main.companyname, NVL(v_line.companyname, v_main.companyname)))
            ELSE NULL
          END
        ) AS "Rebate Vendor Description",

        MAX('None') AS "SBR COGS",
        MAX('None') AS "SBR COGS Description",
        MAX('None') AS "SBR Sales",
        MAX('None') AS "SBR Sales Description",
        MAX('None') AS "Professional Fees",
        MAX('None') AS "Professional Fee Description",
        MAX('None') AS "Marketing Campaigns",
        MAX('None') AS "Marketing Campaign Description",

        /* Licensing Products - grouping dimension */
        NVL(it.upccode, it_ref.upccode) AS "Licensing Products",

        MAX(
          CASE 
            WHEN (CASE 
                    WHEN it.upccode IS NOT NULL AND it.upccode <> '' 
                      THEN it.upccode 
                    ELSE it_ref.upccode 
                  END) IS NOT NULL
            THEN NVL(it.displayname, it_ref.displayname)
            ELSE NULL
          END
        ) AS "Licensing Product Description",
        MAX('None') AS "Programs",
        MAX('None') AS "Program Description",

        /* Licensing Manufacturers - grouping dimension */
        NVL(
          BUILTIN.DF(c_main.custentity_gtf_licensing_manufacturer),
          BUILTIN.DF(c_line.custentity_gtf_licensing_manufacturer)
        ) AS "Licensing Manufacturers",

        MAX(
          CASE 
            WHEN NVL(
              BUILTIN.DF(c_main.custentity_gtf_licensing_manufacturer),
              BUILTIN.DF(c_line.custentity_gtf_licensing_manufacturer)
            ) IS NOT NULL
            AND NVL(
              BUILTIN.DF(c_main.custentity_gtf_licensing_manufacturer),
              BUILTIN.DF(c_line.custentity_gtf_licensing_manufacturer)
            ) <> ''
            THEN NVL(c_main.companyname, c_line.companyname)
            ELSE NULL
          END
        ) AS "Licensing Manufacturer Description",

        /* Licensing Retailers - grouping dimension */
        NVL(it.mpn, it_ref.mpn) AS "Licensing Retailers",

        MAX(
          NVL(
            BUILTIN.DF(it.custitem_gtf_manufacturer),
            BUILTIN.DF(it_ref.custitem_gtf_manufacturer)
          )
        ) AS "Licensing Retailer Description",

        MAX('None') AS "Manufacturing and Warehousing COGS",
        MAX('None') AS "Manufacturing and Warehouse COGS Description",
        MAX('None') AS "Manufacturing and Warehousing Sales",
        MAX('None') AS "Manufacturing and Warehouse Sales Description",
        MAX('None') AS "AR Process Levels",
        MAX('None') AS "AR Process Level Description",
        /* ---- Maximum fields ---- */
        MAX(TO_NUMBER(SUBSTR(?, INSTR(?, ' ') + 1))) AS "FYYear",
        MAX(TO_CHAR(TO_NUMBER(SUBSTR(?, 2, INSTR(?, ' ') - 2)))) AS "MonthNumber",

        /* ---- Sum fields ---- */

        /* Current Period Amount - same for BS and IS */
        SUM(
          CASE 
            WHEN ap.periodName = ?
            THEN NVL(tal.debit, 0) - NVL(tal.credit, 0)
            ELSE 0
          END
        ) AS "Amount",

        /* Opening Balance */
        SUM(
          CASE 
            WHEN acc.accttype IN ('Bank','AcctRec','OthCurrAsset','FixedAsset','OthAsset','AcctPay','CreditCard','OthCurrLiab','LongTermLiab','Equity','DeferRevenue')
              AND ap.periodName <> ?
            THEN NVL(tal.debit, 0) - NVL(tal.credit, 0)
            WHEN acc.accttype NOT IN ('Bank','AcctRec','OthCurrAsset','FixedAsset','OthAsset','AcctPay','CreditCard','OthCurrLiab','LongTermLiab','Equity','DeferRevenue')
              AND ap.periodName <> ?
              AND SUBSTR(ap.periodname, INSTR(ap.periodname, ' ') + 1) = SUBSTR(?, INSTR(?, ' ') + 1)
            THEN NVL(tal.debit, 0) - NVL(tal.credit, 0)
            ELSE 0
          END
        ) AS "OpeningBalance",

        /* YTD Amount */
        SUM(
          CASE 
            WHEN acc.accttype IN ('Bank','AcctRec','OthCurrAsset','FixedAsset','OthAsset','AcctPay','CreditCard','OthCurrLiab','LongTermLiab','Equity','DeferRevenue')
            THEN NVL(tal.debit, 0) - NVL(tal.credit, 0)
            WHEN SUBSTR(ap.periodname, INSTR(ap.periodname, ' ') + 1) = SUBSTR(?, INSTR(?, ' ') + 1)
            THEN NVL(tal.debit, 0) - NVL(tal.credit, 0)
            ELSE 0
          END
        ) AS "YTDAmount"

      FROM transaction t
      JOIN transactionLine tl
        ON t.id = tl.transaction
      JOIN TransactionAccountingLine tal
        ON tal.transaction = tl.transaction
        AND tal.transactionline = tl.id
      JOIN account acc
        ON acc.id = tal.account
      LEFT JOIN subsidiary sub
        ON sub.id = tl.subsidiary
      LEFT JOIN department d
        ON d.id = tl.department
      LEFT JOIN customer c_main
        ON c_main.id = t.entity
      LEFT JOIN customer c_line
        ON c_line.id = tl.entity
      LEFT JOIN vendor v_main
        ON v_main.id = t.entity
      LEFT JOIN vendor v_line
        ON v_line.id = tl.entity
      LEFT JOIN item it
        ON it.id = tl.item
      LEFT JOIN item it_ref
        ON it_ref.id = tl.custcol_gtf_item_reference
      JOIN accountingperiod ap
        ON ap.id = t.postingperiod
      WHERE 
        t.type IN ('CustInvc', 'Journal') 
        AND t.posting = 'T'
        AND tal.account IS NOT NULL
        AND ap.isinactive = 'F'
        AND ap.isquarter = 'F'
        AND ap.isyear = 'F'
        AND tal.accountingbook = 1
        AND ap.enddate <= (
          SELECT ap_target.enddate 
          FROM accountingperiod ap_target
          WHERE ap_target.periodname = ?
        )
      GROUP BY
        sub.externalid,
        acc.acctnumber,
        CASE 
          WHEN d.name LIKE 'D%' THEN d.name
          WHEN d.name LIKE 'G%' THEN d.name
          WHEN t.type = 'Journal' AND tl.entity IS NULL 
            THEN CASE
              WHEN UPPER(BUILTIN.DF(tl.custcol_gtf_legacyaxdept)) IN ('NONE', 'N/A', '') THEN NULL
              ELSE SUBSTR(BUILTIN.DF(tl.custcol_gtf_legacyaxdept), 1, 1)
            END || d.name
          ELSE NVL(
            BUILTIN.DF(c_main.custentity_gtf_customer_account_type),
            NVL(
              BUILTIN.DF(c_line.custentity_gtf_customer_account_type),
              ''
            )
          ) || d.name
        END,
        BUILTIN.DF(tl.cseg_fund),
        NVL(
          BUILTIN.DF(c_line.custentity_gtf_cu_fdrebatevend),
          NVL(
            BUILTIN.DF(c_main.custentity_gtf_cu_fdrebatevend),
            NVL(
              BUILTIN.DF(v_line.custentity_gtf_cu_fdrebatevend),
              BUILTIN.DF(v_main.custentity_gtf_cu_fdrebatevend)
            )
          )
        ),
        NVL(it.upccode, it_ref.upccode),
        NVL(
          BUILTIN.DF(c_main.custentity_gtf_licensing_manufacturer),
          BUILTIN.DF(c_line.custentity_gtf_licensing_manufacturer)
        ),
        NVL(it.mpn, it_ref.mpn)
    `;

  const runReport = (periodName, batchIndex, batchSize) => {
    const NS_MAX_LIMIT = 1000; 
    const sql = buildSuiteQL();
    const pagedData = query.runSuiteQLPaged({
      query: sql,
      params: Array(14).fill(periodName),
      pageSize: NS_MAX_LIMIT
    });

    const totalInternalPages = pagedData.pageRanges.length;
    
    const pagesPerBatch = batchSize / NS_MAX_LIMIT;
    const totalPagesbyBatch = Math.ceil(totalInternalPages / pagesPerBatch)
    const startPageIndex = batchIndex * pagesPerBatch;
    const endPageIndex = startPageIndex + pagesPerBatch;

    let combinedRows = [];

    for (let i = startPageIndex; i < endPageIndex; i++) {
      if (i < totalInternalPages) {
        let page = pagedData.fetch({ index: i });
        combinedRows = combinedRows.concat(page.data.asMappedResults());
      }
    }

    return {
      rows: combinedRows,
      totalRecords: pagedData.count,
      hasMore: endPageIndex < totalInternalPages,
      totalPagesbyBatch: totalPagesbyBatch - 1
    };
  };

  const post = (request) => {
    log.debug('request', request);
    const { period, index, size } = request;
    let _batchIndex = parseInt(index) || 0;
    let _size = parseInt(size) || 1000;

    if (!period) {
      return { ok: false, error: 'Missing parameter: period' };
    }

    const reportData = runReport(period, _batchIndex, _size);

    return {
      ok: true,
      period: period,
      batchIndex: _batchIndex,
      totalPagesbyBatch: reportData.totalPagesbyBatch,
      totalRecords: reportData.totalRecords,
      hasMore: reportData.hasMore,
      count: reportData.rows.length,
      results: reportData.rows
    };
  };
  return { post };
});
