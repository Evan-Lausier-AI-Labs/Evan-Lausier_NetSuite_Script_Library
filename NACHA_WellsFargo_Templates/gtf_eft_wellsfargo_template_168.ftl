<#-- GTF | EFT Payment File - Payment Manager Template ID 168 -->
<#-- Wells Fargo PPD+ EFT Credits (EFT returns / credit payments) -->
<#-- Owner: Thomas Kleynhans | Account: GTF Production 9100765 -->
<#-- Last updated: 2026-03-18 -->
<#-- BUGFIX 2026-03-18 (fix 1): OrgnrDepAcctID BankID corrected from acct_num to bank_num -->
<#--   acct_num (account number) was incorrectly placed in the ABA routing number field -->
<#--   causing Wells Fargo to reject files: 'Originating Bank ID exceeds maximum length' -->
<#-- BUGFIX 2026-03-18 (fix 2): Party name wrapper corrected from <n> to <Name> -->
<#--   <n><Name1> is not a recognized WF XML element; WF parser could not locate party names -->
<#--   causing rejection: 'Originating/Receiving Party Name Information; Field is absent' -->
<#--   Corrected to <Name><Name1> per confirmed Wells Fargo sandbox template -->

<#-- format specific processing -->

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

<#function getReferenceNote payment>
<#assign paidTransactions = transHash[payment.internalid]>
<#assign referenceNote = "">
<#assign paidTransactionsCount = paidTransactions?size>
<#if (paidTransactionsCount >= 1)>
<#list paidTransactions as transaction>
<#if transaction.tranid?has_content>
<#if referenceNote?has_content>
<#assign referenceNote = referenceNote + ", " + transaction.tranid>
<#else>
<#assign referenceNote = transaction.tranid>
</#if>
</#if>
</#list>
</#if>
<#return referenceNote>
</#function>

<#function formatAmountDecimal amount>
<#assign amountStr = formatAmount(amount)?replace(',','')>
<#assign amountNum = amountStr?number>
<#assign amountDecimal = (amountNum / 100)?string("0.00")>
<#return amountDecimal>
</#function>

<#-- Calculate totals -->
<#assign totalAmount = 0>
<#list payments as payment>
<#assign totalAmount = totalAmount + getAmount(payment)>
</#list>
<#assign totalAmountFormatted = formatAmountDecimal(totalAmount)>

<#-- template building -->
#OUTPUT START#
<?xml version="1.0" standalone="no"?>
<File PmtRecCount="${payments?size}" PmtRecTotal="${totalAmountFormatted}">
<#list payments as payment>
<#assign ebank = ebanks[payment_index]>
<#assign ebankAccNum = ebank_accountnums.list[payment_index]>
<#assign entity = entities[payment_index]>
<#assign amount = getAmount(payment)>
<#assign amountFormatted = formatAmountDecimal(amount)>
<PmtRec PmtCrDr="C" PmtMethod="DAC" PmtFormat="PPP">
<IDInfo IDType="BatchID"><ID>${pfa.id}</ID></IDInfo>
<IDInfo IDType="CustomerID"><ID>${cbank.custpage_eft_custrecord_2663_bank_comp_id}</ID></IDInfo>
<Message MsgType="ACH"><MsgText>Payment Detail</MsgText></Message>
<OrgnrParty>
<Name><Name1>${setMaxLength(cbank.custrecord_2663_legal_name, 60)}</Name1></Name>
<PostAddr>
<Addr1></Addr1>
<City></City>
<StateProv></StateProv>
<PostalCode></PostalCode>
<Country></Country>
</PostAddr>
</OrgnrParty>
<RcvrParty>
<Name><Name1>${setMaxLength(buildEntityName(entity,false), 60)}</Name1></Name>
<RefInfo RefType="VN"><RefID>${entity.internalid}</RefID></RefInfo>
<PostAddr>
<Addr1>5620 Glenridge Dr</Addr1>
<City>Atlanta</City>
<StateProv>GA</StateProv>
<PostalCode>30342</PostalCode>
<Country>US</Country>
</PostAddr>
</RcvrParty>
<OrgnrDepAcctID>
<DepAcctID AcctID="${cbank.custpage_eft_custrecord_2663_acct_num}" AcctType="<#if cbank.custrecord_2663_bank_acct_type == 'Savings'>S<#else>D</#if>">
<BankInfo BankIDType="ABA">
<BankID>${cbank.custpage_eft_custrecord_2663_bank_num}</BankID>
</BankInfo>
</DepAcctID>
</OrgnrDepAcctID>
<RcvrDepAcctID>
<DepAcctID AcctID="${ebankAccNum.custrecord_2663_entity_acct_no}" AcctType="<#if ebank.custrecord_2663_entity_bank_acct_type == 'Savings'>S<#else>D</#if>">
<BankInfo BankIDType="ABA">
<BankID>${ebank.custrecord_2663_entity_bank_no}</BankID>
</BankInfo>
</DepAcctID>
</RcvrDepAcctID>
<PmtDetail>
<InvoiceInfo InvoiceType="IV" InvoiceNum="${getReferenceNote(payment)}" NetCurAmt="${amountFormatted}" TotalCurAmt="${amountFormatted}" DiscountCurAmt="0.00">
<POInfo POType="PO"><PONum>PO123456</PONum></POInfo>
</InvoiceInfo>
</PmtDetail>
<PmtID>${payment.tranid}</PmtID>
<CurAmt>${amountFormatted}</CurAmt>
<CurCode>USD</CurCode>
<ValueDate>${pfa.custrecord_2663_process_date?string("yyyy-MM-dd")}</ValueDate>
</PmtRec>
</#list>
<FileInfoGrp FileDate="${pfa.custrecord_2663_file_creation_timestamp?string("yyyy-MM-dd")}" FileControlNumber="${pfa.id}"/>
</File><#rt>
#OUTPUT END#
#RETURN START#
sequenceId:${newSeqId}
#RETURN END#