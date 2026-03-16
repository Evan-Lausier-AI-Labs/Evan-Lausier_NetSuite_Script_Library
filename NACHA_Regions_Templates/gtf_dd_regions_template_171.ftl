<#-- format specific processing -->
<#-- DD TEMPLATE - March 2026 -->
<#-- Fixes: (1) Store# truncation in Individual Name; (2) payment.memo support for item description -->
<#-- Uses field references for Check Digit and DFI (not hardcoded extraction) -->
<#-- For: GTF | DD Regions (ID 171) -->

<#assign newSeqId = 0>

<#function computeSequenceId>
<#assign lastSeqNo = getSequenceId(true)>
<#assign newSeqId = lastSeqNo + 1>
<#assign seqId = (lastSeqNo % 26) + 65>
<#assign seqId = seqId?string?replace("65","A")>
<#assign seqId = seqId?string?replace("66","B")>
<#assign seqId = seqId?string?replace("67","C")>
<#assign seqId = seqId?string?replace("68","D")>
<#assign seqId = seqId?string?replace("69","E")>
<#assign seqId = seqId?string?replace("70","F")>
<#assign seqId = seqId?string?replace("71","G")>
<#assign seqId = seqId?string?replace("72","H")>
<#assign seqId = seqId?string?replace("73","I")>
<#assign seqId = seqId?string?replace("74","J")>
<#assign seqId = seqId?string?replace("75","K")>
<#assign seqId = seqId?string?replace("76","L")>
<#assign seqId = seqId?string?replace("77","M")>
<#assign seqId = seqId?string?replace("78","N")>
<#assign seqId = seqId?string?replace("79","O")>
<#assign seqId = seqId?string?replace("80","P")>
<#assign seqId = seqId?string?replace("81","Q")>
<#assign seqId = seqId?string?replace("82","R")>
<#assign seqId = seqId?string?replace("83","S")>
<#assign seqId = seqId?string?replace("84","T")>
<#assign seqId = seqId?string?replace("85","U")>
<#assign seqId = seqId?string?replace("86","V")>
<#assign seqId = seqId?string?replace("87","W")>
<#assign seqId = seqId?string?replace("88","X")>
<#assign seqId = seqId?string?replace("89","Y")>
<#assign seqId = seqId?string?replace("90","Z")>
<#return seqId>
</#function>

<#function isBalanceLine>
<#return cbank.custpage_dd_custrecord_2663_balance_line >
</#function>

<#function getBankServiceClassCode>
<#assign value = "">
<#if isBalanceLine() >
<#assign value = "200">
<#else>
<#assign value = "225">
</#if>
<#return value>
</#function>

<#function getEntityBankAccountType bankAccount>
<#assign value = "">
<#if bankAccount == "Savings" >
<#assign value = "37">
<#else>
<#assign value = "27">
</#if>
<#return value>
</#function>

<#function getBalanceLineTransactionCode>
<#assign value = "">
<#if isBalanceLine() >
<#assign cbankAcctType = cbank.custpage_dd_custrecord_2663_bank_acct_type>
<#if cbankAcctType == "Savings">
<#assign value = "32">
<#else>
<#assign value = "22">
</#if>
</#if>
<#return value>
</#function>

<#function computeTotalRecords recordCount>
<#assign value = (recordCount / 10) >
<#assign value = value?ceiling >
<#return value>
</#function>

<#function getTotalCreditAmt totalAmount>
<#assign value = 0>
<#if isBalanceLine() >
<#assign value = totalAmount>
</#if>
<#return value>
</#function>

<#-- Individual Name: use payment.memo if populated, else preserve store number in entity name -->
<#function computeEntityName entity payment>
<#assign memoVal = payment.memo!"">
<#if memoVal?has_content>
<#return memoVal>
</#if>
<#assign fullName = buildEntityName(entity, false)>
<#assign sep = " - ">
<#assign firstSep = fullName?index_of(sep)>
<#if (firstSep >= 0)>
<#assign storeAndRest = fullName?substring(firstSep + 3)>
<#assign secondSep = storeAndRest?index_of(sep)>
<#if (secondSep >= 0)>
<#assign storeNum = storeAndRest?substring(0, secondSep)>
<#else>
<#assign storeNum = storeAndRest>
</#if>
<#assign suffix = sep + storeNum>
<#assign maxPrefixLen = 22 - suffix?length>
<#if (maxPrefixLen < 0)><#assign maxPrefixLen = 0></#if>
<#assign brand = fullName?substring(0, firstSep)>
<#if (brand?length > maxPrefixLen)>
<#assign brand = brand?substring(0, maxPrefixLen)>
</#if>
<#return brand + suffix>
<#else>
<#return fullName>
</#if>
</#function>

<#-- counters / flags-->
<#assign recordCount = 0>
<#assign batchCount = 0>
<#assign batchLineNum = 0>
<#assign entityBankNumberHash = 0>
<#assign totalAmount = 0>

<#-- PRE-COMPUTE: Originating DFI from processor_code + bank_code fields -->
<#assign originatingDFI = cbank.custpage_dd_custrecord_2663_processor_code + cbank.custpage_dd_custrecord_2663_bank_code>
<#assign originatingCheckDigit = cbank.custpage_dd_custrecord_2663_country_check!"">

<#-- format building -->
#OUTPUT START#
101 ${setLength(cbank.custpage_dd_custrecord_2663_bank_num,9)}${setLength(cbank.custpage_dd_custrecord_2663_bank_comp_id,10)}${pfa.custrecord_2663_file_creation_timestamp?date?string("yyMMdd")}${pfa.custrecord_2663_file_creation_timestamp?time?string("HHmm")}${setLength(computeSequenceId(),1)}094101${setLength(cbank.custpage_dd_custrecord_2663_bank_name,23)}${setLength(cbank.custrecord_2663_legal_name,23)}${setLength(pfa.id,8)}
<#assign recordCount = recordCount + 1>
<#assign batchCount = batchCount + 1>
5${getBankServiceClassCode()}${setLength(cbank.custrecord_2663_legal_name,16)}${setLength("",20)}${setLength(cbank.custpage_dd_custrecord_2663_issuer_num,10)}PPD${setLength("Payment",10)}${pfa.custrecord_2663_process_date?string("yyMMdd")}${pfa.custrecord_2663_process_date?string("yyMMdd")}${setLength("",3)}1${setLength(originatingDFI,8)}${setPadding(batchCount,"left","0",7)}
<#assign recordCount = recordCount + 1>
<#list payments as payment>
<#assign batchLineNum = batchLineNum + 1>
<#assign ebank = ebanks[payment_index]>
<#assign ebankAccNum = ebank_accountnums.list[payment_index]>
<#assign entity = entities[payment_index]>
<#-- Entity routing: DFI (first 8 of routing) and Check Digit (from field) -->
<#assign entityDFI = setMaxLength(ebank.custrecord_2663_entity_bank_no, 8)>
<#assign entityCheckDigit = ebank.custrecord_2663_entity_country_check!"">
<#if entityDFI?has_content && entityDFI?matches("\\d+")>
<#assign entityBankNumberHash = entityBankNumberHash + entityDFI?number>
</#if>
<#assign amount = getAmount(payment)>
<#assign totalAmount = totalAmount + amount>
6${setLength(getEntityBankAccountType(ebank.custrecord_2663_entity_bank_acct_type),2)}${setLength(entityDFI,8)}${setLength(entityCheckDigit,1)}${setLength(ebankAccNum.custrecord_2663_entity_acct_no,17)}${setPadding(formatAmount(amount),"left","0",10)}${setLength(entity.internalid,15)}${setLength(computeEntityName(entity,payment),22)}  0${setLength(originatingDFI,8)}${setPadding(batchLineNum,"left","0",7)}
<#assign recordCount = recordCount + 1>
</#list>
<#if isBalanceLine()>
<#assign batchLineNum = batchLineNum + 1>
<#if originatingDFI?has_content && originatingDFI?matches("\\d+")>
<#assign entityBankNumberHash = entityBankNumberHash + originatingDFI?number>
</#if>
6${setLength(getBalanceLineTransactionCode(),2)}${setLength(originatingDFI,8)}${setLength(originatingCheckDigit,1)}${setLength(cbank.custpage_dd_custrecord_2663_acct_num,17)}${setPadding(formatAmount(totalAmount),"left","0",10)}${setLength("",15)}${setLength(cbank.custrecord_2663_print_company_name,22)}  0${setLength(originatingDFI,8)}${setPadding(batchLineNum,"left","0",7)}
<#assign recordCount = recordCount + 1>
</#if>
8${getBankServiceClassCode()}${setPadding(batchLineNum,"left","0",6)}${setPadding(entityBankNumberHash?c,"left","0",10)}${setPadding(formatAmount(totalAmount),"left","0",12)}${setPadding(formatAmount(getTotalCreditAmt(totalAmount)),"left","0",12)}${setLength(cbank.custpage_dd_custrecord_2663_issuer_num,10)}${setLength("",19)}${setLength("",6)}${setLength(originatingDFI,8)}${setPadding(batchCount,"left","0",7)}
<#assign recordCount = recordCount + 2>
<#if cbank.custpage_dd_custrecord_2663_pad_blocks && (recordCount % 10 > 0)>
<#assign numBlocks = 10 - (recordCount % 10) >
<#assign padding = "9999999999999999999999999999999999999999999999999999999999999999999999999999999999999999999994">
<#assign padBlocksString = "\n">
<#list 1..numBlocks as i>
<#assign padBlocksString = padBlocksString + padding + "\n">
</#list>
</#if>
9${setPadding(batchCount,"left","0",6)}${setPadding(computeTotalRecords(recordCount),"left","0",6)}${setPadding(batchLineNum,"left","0",8)}${setPadding(entityBankNumberHash?c,"left","0",10)}${setPadding(formatAmount(totalAmount),"left","0",12)}${setPadding("","left","0",12)}${setLength("",39)}${padBlocksString}<#rt>
#OUTPUT END#
#RETURN START#
sequenceId:${newSeqId}
#RETURN END#