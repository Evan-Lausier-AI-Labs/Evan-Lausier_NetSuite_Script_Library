# SuiteQL_Query_Tool

A SuiteScript 2.x Suitelet for running SuiteQL queries directly against a NetSuite instance with an interactive web-based interface.

## Overview

The SuiteQL Query Tool provides NetSuite administrators and developers with a convenient way to execute SuiteQL queries, view results in real-time, and export data—all without leaving the NetSuite environment. This tool is essential for data analysis, troubleshooting, and ad-hoc reporting needs.

## Features

- **Interactive Query Editor** - Write and execute SuiteQL queries with tab support for proper indentation
- - **Real-Time Results Display** - View query results in both JSON format and a formatted sublist table
  - - **Query Performance Metrics** - See execution time for each query to optimize performance
    - - **Export to CSV** - Export query results directly to CSV format for external analysis
      - - **Save Queries** - Save frequently used queries to the File Cabinet for reuse
        - - **Load Queries** - Load previously saved queries from the File Cabinet
          - - **Error Handling** - Clear error messages displayed when queries fail
            - - **Large Dataset Support** - Handles large result sets with intelligent truncation for display
             
              - ## Script Details
             
              - | Property | Value |
              - |----------|-------|
              - | **Script Type** | Suitelet |
              - | **API Version** | 2.x |
              - | **Module Scope** | Public |
              - | **Script ID** | `_sql_query_tool` |
             
              - ## Required Modules
             
              - - `N/file` - File Cabinet operations for saving/loading queries
                - - `N/log` - Logging functionality
                  - - `N/query` - SuiteQL query execution
                    - - `N/ui/serverWidget` - UI form generation
                     
                      - ## Original Author
                     
                      - - **Tim Dietrich**
                        - - timdietrich@me.com
                          - - https://timdietrich.me
