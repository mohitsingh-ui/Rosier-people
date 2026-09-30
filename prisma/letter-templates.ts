// Default letter templates. HR edits these in Settings → Document templates.
// Variables: {{employee_name}}, {{designation}}, {{department}}, {{joining_date}}, {{salary}}, {{manager_name}}, {{employee_id}} and more.

const sign = "\n\nWarm regards,";

export const LETTER_TEMPLATES = [
  {
    name: "Offer Letter", kind: "OFFER_LETTER", subject: "Offer of Employment",
    body: `Dear {{employee_name}},

We're delighted to offer you the position of {{designation}} in our {{department}} team at {{company_name}}.

Your annual cost to company will be {{annual_ctc}}. Your expected date of joining is {{joining_date}}, and you will be based at {{location}}. You will report to {{manager_name}}.

This offer is subject to verification of your documents and references. Please sign and return a copy of this letter to confirm your acceptance.

We're excited to have you help us bring honest, traditional food to more Indian homes.${sign}`,
  },
  {
    name: "Appointment Letter", kind: "APPOINTMENT_LETTER", subject: "Letter of Appointment",
    body: `Dear {{employee_name}},

Further to your acceptance of our offer, we are pleased to appoint you as {{designation}} in the {{department}} department with effect from {{joining_date}}. Your employee ID is {{employee_id}}.

You will be on probation for six months, after which your confirmation will be based on performance. Your compensation is {{annual_ctc}} per annum, as detailed in the annexure.

You will be governed by the company's policies as updated from time to time and available in Rosier People.${sign}`,
  },
  {
    name: "Salary Revision Letter", kind: "SALARY_REVISION_LETTER", subject: "Revision of Compensation",
    body: `Dear {{employee_name}},

In recognition of your contribution, your annual compensation has been revised to {{annual_ctc}} with effect from {{effective_date}}.

All other terms of your employment remain unchanged. Thank you for everything you bring to Rosier.${sign}`,
  },
  {
    name: "Promotion Letter", kind: "PROMOTION_LETTER", subject: "Promotion",
    body: `Dear {{employee_name}},

Congratulations! We're pleased to promote you to {{new_designation}} with effect from {{effective_date}}.

This recognises the ownership and results you've shown. Your revised compensation is {{annual_ctc}} per annum. You will continue to report to {{manager_name}}.${sign}`,
  },
  {
    name: "Transfer Letter", kind: "TRANSFER_LETTER", subject: "Transfer",
    body: `Dear {{employee_name}},

This is to inform you that you are being transferred to {{new_location}} ({{new_department}}) with effect from {{effective_date}}.

Your designation, compensation and other terms remain unchanged. HR will help you with relocation support as per policy.${sign}`,
  },
  {
    name: "Experience Letter", kind: "EXPERIENCE_LETTER", subject: "Experience Certificate",
    body: `To whom it may concern,

This is to certify that {{employee_name}} (Employee ID {{employee_id}}) worked with {{company_name}} from {{joining_date}} to {{exit_date}}. At the time of leaving, they held the position of {{designation}} in the {{department}} department.

During their time with us, we found them sincere and hard-working. We wish them the very best.${sign}`,
  },
  {
    name: "Relieving Letter", kind: "RELIEVING_LETTER", subject: "Relieving Letter",
    body: `Dear {{employee_name}},

This refers to your resignation. We confirm that you are relieved from the services of {{company_name}} at the close of business on {{exit_date}}.

We confirm that you have completed all clearance formalities. Thank you for your contribution, and all the best for what's next.${sign}`,
  },
  {
    name: "Warning Letter", kind: "WARNING_LETTER", subject: "Warning",
    body: `Dear {{employee_name}},

This letter is a formal warning regarding: {{reason}}.

We expect immediate improvement. Please treat this seriously; a repeat may lead to further action as per company policy. You may discuss this with HR or {{manager_name}}.${sign}`,
  },
  {
    name: "Increment Letter", kind: "INCREMENT_LETTER", subject: "Annual Increment",
    body: `Dear {{employee_name}},

We're pleased to inform you that your annual increment has been approved. Your revised annual CTC is {{annual_ctc}} effective {{effective_date}}.

Keep up the great work.${sign}`,
  },
  {
    name: "Appraisal Letter", kind: "APPRAISAL_LETTER", subject: "Performance Appraisal",
    body: `Dear {{employee_name}},

Thank you for your contributions over the review period. Based on your performance review with {{manager_name}}, your compensation has been revised to {{annual_ctc}} effective {{effective_date}}.

We look forward to another great year together.${sign}`,
  },
  {
    name: "Internship Certificate", kind: "INTERNSHIP_CERTIFICATE", subject: "Internship Certificate",
    body: `To whom it may concern,

This is to certify that {{employee_name}} completed an internship with the {{department}} team at {{company_name}} from {{joining_date}} to {{exit_date}} as {{designation}}.

They showed curiosity, care and a willingness to learn. We wish them success ahead.${sign}`,
  },
  {
    name: "Employment Verification Letter", kind: "EMPLOYMENT_VERIFICATION_LETTER", subject: "Employment Verification",
    body: `To whom it may concern,

This is to confirm that {{employee_name}} (Employee ID {{employee_id}}) is employed with {{company_name}} as {{designation}} in the {{department}} department since {{joining_date}}.

This letter is issued on the employee's request for official purposes.${sign}`,
  },
];
