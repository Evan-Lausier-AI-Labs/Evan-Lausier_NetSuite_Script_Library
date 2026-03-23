/**
* @NApiVersion 2.1
* @NScriptType Restlet
*
* Fix (2026-03-14): Department/SBR CASE now treats custcol_gtf_legacyaxdept = 'NONE'
* as NULL instead of extracting first character 'N', which caused trial balance JE lines
* with no department to split across two rows ('N' and blank) rather than consolidating
* under a single NULL department group.
*
* Fix (2026-03-19a): Added 'DeferRevenue' to balance sheet accttype list in OpeningBalance
* (x2) and YTDAmount (x1) CASE expressions. Without this, all 20 Deferred Revenue accounts
* (~$63.4M total balance) were incorrectly treated as income statement accounts, returning
* YTD-only activity instead of cumulative ending balances. Account 2055 example: was
* returning -$106,659.90 (2025 YTD only) instead of correct $220,521.30 (cumulative).
* Confirmed via full accttype audit: DeferRevenue is the only BS type missing from the list.
* Income, Expense, OthExpense, and COGS are correctly absent (IS accounts).
*
* Fix (2026-03-19b): Added synthetic Retained Earnings prior-year net income roll-forward.
* NetSuite does not post year-end closing journal entries when periods are locked - it
* computes Retained Earnings dynamically at report runtime. Because GTF has not run
* NetSuite's year-end close for FY2023 or FY2024, no physical GL postings exist for the
* roll-forward. A secondary query computes prior-year IS net income by subsidiary and
* injects synthetic rows on account 350005, mirroring NetSuite's Balance Sheet reporting
* layer. Self-correcting: if year-end close is run in the future, the IS balances for
* that year drop to zero and the synthetic rows contribute $0 automatically.
* Missing amount confirmed: -$66.3M (FY2023) + -$56.2M (FY2024) = -$122,468,823.03.
*
* Fix (2026-03-22): Added 'OthIncome' to accttype IN list in
* buildRetainedEarningsRollForwardSQL. The main query excludes OthIncome from the BS
* cumulative bucket by omission, so the RE roll-forward must include it to stay in sync.
* OthIncome is currently $0 at GTF (confirmed: prior gap ties to within $1 without it),
* but must be present for correctness and to handle any future OthIncome postings.
*
* Fix (2026-03-23): Split RE roll-forward into two separate synthetic queries.
* The original buildRetainedEarningsRollForwardSQL summed ALL prior-year IS activity
* by subsidiary with no fund filter. For Ad Fund entities (165, 187, 203, 226, 244,
* 260, 280) this caused fund-segmented IS net income to be injected into 350005
* instead of 3005, overcounting 350005 and leaving account 3005 with no roll-forward.
*
* Resolution: buildRetainedEarningsRollForwardSQL now adds tl.cseg_fund IS NULL so
* it captures only non-fund Ops IS net income, correctly attributed to 350005.
* New buildAdFundRollForwardSQL captures fund-segmented IS grouped by entity AND
* fund segment, injecting synthetic rows on account 3005 with the fund dimension
* populated -- mirroring exactly how AX closed Ad Fund P&L to fund-dimensioned RE.
* Both queries remain self-correcting against a future NS year-end close.
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

  /*
   * 350005 roll-forward: non-fund Ops IS net income by subsidiary.
   *
   * Filters tl.cseg_fund IS NULL so that only non-fund IS activity is
   * captured here. Fund-segmented IS activity is handled separately by
   * buildAdFundRollForwardSQL and injected on account 3005.
   *
   * Self-correcting: once NS year-end close (Manual Close) is run for a
   * given year, IS balances for that year drop to zero automatically.
   * NS Automatic Close does NOT post physical JEs so this synthetic fix
   * remains necessary regardless of period close status.
   *
   * Two bound parameters: both set to periodName for year comparison.
   */
  const buildRetainedEarningsRollForwardSQL = () => `
      SELECT
        sub.externalid                                 AS entity,
        MAX(sub.name)                                  AS subname,
        SUM(NVL(tal.debit, 0) - NVL(tal.credit, 0))  AS prior_year_ni
      FROM transaction t
      JOIN transactionline tl
        ON t.id = tl.transaction
      JOIN transactionaccountingline tal
        ON tal.transaction = tl.transaction
        AND tal.transactionline = tl.id
      JOIN account acc
        ON acc.id = tal.account
      JOIN accountingperiod ap
        ON ap.id = t.postingperiod
      LEFT JOIN subsidiary sub
        ON sub.id = tl.subsidiary
      WHERE t.type IN ('CustInvc', 'Journal')
        AND t.posting = 'T'
        AND tal.accountingbook = 1
        AND acc.accttype IN ('Income', 'Expense', 'OthExpense', 'COGS', 'OthIncome')
        AND ap.isinactive = 'F'
        AND ap.isquarter = 'F'
        AND ap.isyear = 'F'
        AND tl.cseg_fund IS NULL
        AND SUBSTR(ap.periodname, INSTR(ap.periodname, ' ') + 1)
              < SUBSTR(?, INSTR(?, ' ') + 1)
      GROUP BY sub.externalid
      HAVING SUM(NVL(tal.debit, 0) - NVL(tal.credit, 0)) <> 0
    `;

  /*
   * 3005 roll-forward: fund-segmented Ad Fund IS net income by subsidiary and fund.
   *
   * Filters tl.cseg_fund IS NOT NULL so that only fund-dimensioned IS activity is
   * captured. Results are grouped by entity AND fund segment and injected as synthetic
   * rows on account 3005 with the fund dimension populated, mirroring exactly how AX
   * closed Ad Fund P&L to fund-dimensioned RE at year-end.
   *
   * Self-correcting: same as the 350005 query above.
   *
   * Two bound parameters: both set to periodName for year comparison.
   */
  const buildAdFundRollForwardSQL = () => `
      SELECT
        sub.externalid                                 AS entity,
        MAX(sub.name)                                  AS subname,
        tl.cseg_fund                                   AS fund_id,
        MAX(BUILTIN.DF(tl.cseg_fund))                  AS fund_display,
        SUM(NVL(tal.debit, 0) - NVL(tal.credit, 0))  AS prior_year_ni
      FROM transaction t
      JOIN transactionline tl
        ON t.id = tl.transaction
      JOIN transactionaccountingline tal
        ON tal.transaction = tl.transaction
        AND tal.transactionline = tl.id
      JOIN account acc
        ON acc.id = tal.account
      JOIN accountingperiod ap
        ON ap.id = t.postingperiod
      LEFT JOIN subsidiary sub
        ON sub.id = tl.subsidiary
      WHERE t.type IN ('CustInvc', 'Journal')
        AND t.posting = 'T'
        AND tal.accountingbook = 1
        AND acc.accttype IN ('Income', 'Expense', 'OthExpense', 'COGS', 'OthIncome')
        AND ap.isinactive = 'F'
        AND ap.isquarter = 'F'
        AND ap.isyear = 'F'
        AND tl.cseg_fund IS NOT NULL
        AND SUBSTR(ap.periodname, INSTR(ap.periodname, ' ') + 1)
              < SUBSTR(?, INSTR(?, ' ') + 1)
      GROUP BY sub.externalid, tl.cseg_fund
      HAVING SUM(NVL(tal.debit, 0) - NVL(tal.credit, 0)) <> 0
    `;

  /*
   * Shared helper: maps a roll-forward result row into the full column shape
   * expected by OneStream. Handles both the 350005 (Ops RE) and 3005 (Ad Fund RE)
   * cases via the account, acctDescription, and fund parameters.
   *
   * For 350005 rows: fund is null (no fund dimension on Ops RE).
   * For 3005 rows:   fund is the display value of the fund segment (e.g. 'FD0009').
   *
   * Amount = 0 (no current-period component for prior-year NI).
   * OpeningBalance = YTDAmount = prior_year_ni (BS cumulative account logic).
   */
  const buildSyntheticRow = (row, periodName, account, acctDescription, fund) => {
    const periodNum  = String(parseInt(periodName.substring(1, periodName.indexOf(' ')), 10));
    const fiscalYear = parseInt(periodName.substring(periodName.indexOf(' ') + 1), 10);
    const ni         = row['prior_year_ni'] || 0;

    return {
      'entity'                                        : row['entity'],
      'Entity Entity Description'                     : row['subname'],
      'account'                                       : account,
      'Account Account Description'                   : acctDescription,
      'Department/SBR'                                : null,
      'Department/SBR Department SBR Description'     : null,
      'Funds'                                         : fund || null,
      'Period'                                        : periodNum,
      'Category'                                      : null,
      'Category Description'                          : null,
      'Rebate Vendors'                                : null,
      'Rebate Vendor Description'                     : null,
      'SBR COGS'                                      : 'None',
      'SBR COGS Description'                          : 'None',
      'SBR Sales'                                     : 'None',
      'SBR Sales Description'                         : 'None',
      'Professional Fees'                             : 'None',
      'Professional Fee Description'                  : 'None',
      'Marketing Campaigns'                           : 'None',
      'Marketing Campaign Description'                : 'None',
      'Licensing Products'                            : null,
      'Licensing Product Description'                 : null,
      'Programs'                                      : 'None',
      'Program Description'                           : 'None',
      'Licensing Manufacturers'                       : null,
      'Licensing Manufacturer Description'            : null,
      'Licensing Retailers'                           : null,
      'Licensing Retailer Description'                : null,
      'Manufacturing and Warehousing COGS'            : 'None',
      'Manufacturing and Warehouse COGS Description'  : 'None',
      'Manufacturing and Warehousing Sales'           : 'None',
      'Manufacturing and Warehouse Sales Description' : 'None',
      'AR Process Levels'                             : 'None',
      'AR Process Level Description'                  : 'None',
      'FYYear'                                        : fiscalYear,
      'MonthNumber'                                   : periodNum,
      'Amount'                                        : 0,
      'OpeningBalance'                                : ni,
      'YTDAmount'                                     : ni
    };
  };

  const runReport = (periodName, batchIndex, batchSize) => {
    const NS_MAX_LIMIT   = 1000;
    const sql            = buildSuiteQL();
    const pagedData      = query.runSuiteQLPaged({
      query    : sql,
      params   : Array(14).fill(periodName),
      pageSize : NS_MAX_LIMIT
    });

    const totalInternalPages = pagedData.pageRanges.length;
    const pagesPerBatch      = batchSize / NS_MAX_LIMIT;
    const totalPagesbyBatch  = Math.ceil(totalInternalPages / pagesPerBatch);
    const startPageIndex     = batchIndex * pagesPerBatch;
    const endPageIndex       = startPageIndex + pagesPerBatch;

    let combinedRows = [];

    for (let i = startPageIndex; i < endPageIndex; i++) {
      if (i < totalInternalPages) {
        const page = pagedData.fetch({ index: i });
        combinedRows = combinedRows.concat(page.data.asMappedResults());
      }
    }

    /*
     * Inject synthetic roll-forward rows on the first batch only.
     * Subsequent batches contain only paged main query rows to avoid
     * duplicating the synthetic rows across multiple OneStream batch calls.
     */
    if (batchIndex === 0) {

      /* 350005: non-fund Ops IS net income by subsidiary */
      try {
        const reSql     = buildRetainedEarningsRollForwardSQL();
        const reResults = query.runSuiteQL({
          query  : reSql,
          params : [periodName, periodName]
        });
        const reRows = reResults.asMappedResults();
        log.debug('350005 RE roll-forward rows', JSON.stringify(reRows));
        reRows.forEach(row => {
          combinedRows.push(buildSyntheticRow(
            row,
            periodName,
            '350005',
            'Equity | Operations : Retained Earnings / Deficit',
            null
          ));
        });
      } catch (e) {
        log.error('350005 RE roll-forward query failed', e.message);
        /* Non-fatal: log and continue */
      }

      /* 3005: fund-segmented Ad Fund IS net income by subsidiary and fund */
      try {
        const afSql     = buildAdFundRollForwardSQL();
        const afResults = query.runSuiteQL({
          query  : afSql,
          params : [periodName, periodName]
        });
        const afRows = afResults.asMappedResults();
        log.debug('3005 Ad Fund roll-forward rows', JSON.stringify(afRows));
        afRows.forEach(row => {
          combinedRows.push(buildSyntheticRow(
            row,
            periodName,
            '3005',
            'Retained Earnings | Ad Funds : Retained Earnings / Accumulated Deficit',
            row['fund_display'] || null
          ));
        });
      } catch (e) {
        log.error('3005 Ad Fund roll-forward query failed', e.message);
        /* Non-fatal: log and continue */
      }

    }

    return {
      rows             : combinedRows,
      totalRecords     : pagedData.count,
      hasMore          : endPageIndex < totalInternalPages,
      totalPagesbyBatch: totalPagesbyBatch - 1
    };
  };

  const post = (request) => {
    log.debug('request', request);
    const { period, index, size } = request;
    let _batchIndex = parseInt(index) || 0;
    let _size       = parseInt(size)  || 1000;

    if (!period) {
      return { ok: false, error: 'Missing parameter: period' };
    }

    const reportData = runReport(period, _batchIndex, _size);

    return {
      ok               : true,
      period           : period,
      batchIndex       : _batchIndex,
      totalPagesbyBatch: reportData.totalPagesbyBatch,
      totalRecords     : reportData.totalRecords,
      hasMore          : reportData.hasMore,
      count            : reportData.rows.length,
      results          : reportData.rows
    };
  };

  return { post };
});
