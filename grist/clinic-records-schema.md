# Grist tables: Clinic Records (patients, prescriptions, invoices, payments, visits)

Added **inside each clinic's existing Grist doc**, next to Leads / Appointments / Messages. Purely additive: no existing table or column
is renamed or changed, and no n8n workflow reads or writes these tables. Create them with `npm run provision-records` (in `flowhq/`),
which adds only what is missing. Column names are exact: `flowhq/src/server/records/schema.ts` is generated from this file by hand
and a test keeps the two in step.

Conventions: our own text ids (`Patient_ID`, `Rx_ID`, `Invoice_No`, `Payment_ID`) are the stable keys, never Grist row numbers.
Money is stored as **integer paise** (INR × 100). Dates are Grist `Date` (UTC midnight epoch seconds); timestamps are `DateTime` (Asia/Kolkata).
Nothing is ever deleted through the app: records are voided or superseded, so history is kept.

## Patients
| Column | Type | Notes |
|---|---|---|
| Patient_ID | Text | `GK-P-000001` (prefix from `config/clinic.json`), set by FLOW HQ, unique |
| Serial_No | Int | register serial number, set by FLOW HQ |
| Name | Text | required |
| Phone | Text | `+91XXXXXXXXXX` when given |
| Address | Text | |
| Age | Text | free text ("34", "8 months") |
| Sex | Choice | Male, Female, Other |
| Referred_By | Text | referring doctor |
| Occupation | Text | |
| Main_Complaint | Text | the disorder, as recorded by the clinician |
| Registered_On | Date | |
| Status | Choice | Active, Completed, Inactive |
| Follow_Up_On | Date | |
| Source_Lead_ID | Text | optional link to Leads.Lead_ID, set only by a person, never automatically |
| Notes | Text | |
| Created_At, Created_By | DateTime, Text | |

## Prescriptions
Append-only: an edit writes a **new row** with the same `Rx_ID` and `Version + 1`; the latest version is the current sheet.
| Column | Type | Notes |
|---|---|---|
| Rx_ID | Text | `RX-000001` |
| Version | Int | starts at 1 |
| Patient_ID | Text | must exist in Patients |
| Rx_Date | Date | |
| Treating_Physio | Text | |
| BP | Text | |
| Vitals | Text | other recorded vitals |
| History | Text | |
| Examination | Text | O/E |
| Diagnosis | Text | entered by the clinician only |
| Treatment_Plan | Text | |
| Exercises | Text | |
| Advice | Text | |
| Follow_Up_On | Date | |
| Created_At, Created_By | DateTime, Text | of this version |

## Rx_Images
| Column | Type | Notes |
|---|---|---|
| Image_ID | Text | `IMG-000001` |
| Rx_ID | Text | |
| Patient_ID | Text | |
| File | Attachments | the Grist attachment (kept while referenced by this cell) |
| Mime | Text | image/jpeg or image/png, checked by file signature |
| Bytes | Int | |
| Caption | Text | |
| Removed | Toggle | removal hides the image, the file is kept |
| Created_At, Created_By | DateTime, Text | |

## Invoices
Saved invoices are final. A mistake is corrected by voiding the invoice (reason required) and issuing a new one.
| Column | Type | Notes |
|---|---|---|
| Invoice_No | Text | `GK-2026-000001`, prefix and year, set by FLOW HQ, unique |
| Patient_ID | Text | must exist in Patients |
| Invoice_Date | Date | |
| Status | Choice | issued, void |
| Subtotal_Paise, Discount_Paise, Tax_Paise, Total_Paise | Int | Total = Subtotal − Discount + Tax |
| Tax_Label | Text | empty when no tax |
| Tax_Rate_Bp | Int | basis points (1800 = 18%), 0 when no tax |
| Notes | Text | |
| Void_Reason | Text | |
| Idem_Key | Text | duplicate-submission guard |
| Created_At, Created_By | DateTime, Text | |

## Invoice_Lines
| Column | Type | Notes |
|---|---|---|
| Invoice_No | Text | |
| Line_No | Int | 1.. |
| Description | Text | |
| Qty | Int | sessions or units, at least 1 |
| Unit_Price_Paise | Int | |
| Line_Total_Paise | Int | Qty × Unit_Price_Paise |

## Payments
Append-only. A wrong payment is voided (reason required), never edited.
| Column | Type | Notes |
|---|---|---|
| Payment_ID | Text | `PAY-000001` |
| Invoice_No | Text | |
| Patient_ID | Text | |
| Paid_On | Date | |
| Amount_Paise | Int | greater than 0 and not more than the invoice balance |
| Method | Choice | Cash, UPI, Card, Bank transfer, Cheque, Other |
| Reference | Text | UPI / cheque / transaction reference |
| Notes | Text | |
| Voided | Toggle | |
| Void_Reason | Text | |
| Idem_Key | Text | duplicate-submission guard |
| Created_At, Created_By | DateTime, Text | |

## Visits
One row per patient per day (marking the same day again updates it). Feeds the Monday–Sunday attendance grid.
| Column | Type | Notes |
|---|---|---|
| Patient_ID | Text | |
| Visit_Date | Date | |
| Status | Choice | Attended, Missed, Cancelled |
| Notes | Text | |
| Recorded_By | Text | |
| Created_At | DateTime | |

## Audit_Log
Who did what, when. Never contains clinical text or image data.
| Column | Type | Notes |
|---|---|---|
| At | DateTime | |
| User | Text | |
| Action | Text | e.g. patient.create, invoice.void, payment.add |
| Record | Text | the stable id |
| Summary | Text | short, non-clinical |

## Access (set in Grist by the agency)
FLOW HQ reads and writes with its own API key. In Grist itself make these tables read-only for the front desk, so staff change them through the app.
