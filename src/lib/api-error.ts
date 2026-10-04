import "server-only";
import { NextResponse } from "next/server";

const messages: Record<string, string> = {
  FORBIDDEN: "ليس لديك صلاحية لتنفيذ هذا الإجراء.",
  UNAUTHORIZED: "يجب تسجيل الدخول أولًا.",
  INVALID_ORIGIN: "مصدر الطلب غير موثوق. حدّث الصفحة وحاول مرة أخرى.",
  INVALID_CONTENT_TYPE: "نوع بيانات الطلب غير مدعوم.",
  INVALID_DATA: "راجع البيانات المطلوبة والقيم المدخلة.",
  INVALID_JOB_TITLE: "اختر مسمى وظيفيًا صحيحًا.",
  INVALID_NAME: "أدخل اسمًا صحيحًا لا يقل عن حرفين.",
  INVALID_AVATAR: "الصورة غير صالحة. استخدم JPG أو PNG أو WebP بحجم لا يتجاوز 2 ميجابايت.",
  EMAIL_EXISTS: "البريد الإلكتروني مستخدم بالفعل.",
  ROLE_NOT_FOUND: "الدور الوظيفي المحدد غير موجود.",
  CREATE_FAILED: "تعذر إنشاء الحساب. راجع البيانات وحاول مرة أخرى.",
  SELF_ROLE_CHANGE: "لا يمكنك تغيير دور حسابك الحالي.",
  SELF_DEACTIVATE: "لا يمكنك تعطيل حسابك الحالي.",
  SELF_PROFILE_CHANGE: "لا يمكنك تعديل ربط ملفك الوظيفي من هذه الشاشة.",
  ENGINEER_PROFILE_REQUIRED: "هذا الإجراء متاح لحسابات المهندسين فقط.",
  EMPLOYEE_NOT_FOUND: "الموظف المحدد غير موجود.",
  EMPLOYEE_ALREADY_LINKED: "الموظف مرتبط بحساب آخر بالفعل.",
  ADMIN_LOCKED: "لا يمكن تعديل صلاحيات دور مدير النظام.",
  INVALID_PERMISSION: "توجد صلاحية غير صحيحة ضمن الاختيارات.",
  ADMIN_PERMISSION_LOCKED: "صلاحية إدارة الحسابات محجوزة لمدير النظام.",
  SELF_DELETE: "لا يمكنك حذف حسابك الحالي.",
  USER_NOT_FOUND: "الحساب المطلوب غير موجود.",
  DELETE_FAILED: "تعذر حذف الحساب لوجود بيانات مرتبطة به.",
  ATTENTION_UNAVAILABLE: "تعذر تحميل التنبيهات الآن. حاول مرة أخرى بعد قليل.",
  INVALID_OWNER: "اختر جهة مالكة صحيحة ونشطة.",
  INVALID_PROJECT: "اختر مشروعًا صحيحًا ونشطًا.",
  INVALID_COMPANY: "الشركة أو الجهة المحددة غير موجودة أو غير نشطة.",
  INVALID_ENGINEER: "الموظف المحدد غير موجود أو غير نشط.",
  DUPLICATE_OR_INVALID: "البيانات مكررة أو غير صحيحة. راجعها وحاول مرة أخرى.",
  NOT_FOUND_OR_INVALID: "السجل غير موجود أو لا يمكن تعديله في حالته الحالية.",
  NOT_FOUND: "السجل المطلوب غير موجود.",
};

export function apiError(code: string, status: number, fallback?: string) {
  const error = fallback || messages[code] || "حدث خطأ غير متوقع. حاول مرة أخرى.";
  return NextResponse.json({ error, code }, { status });
}

export function arabicErrorMessage(reason: unknown, fallback: string) {
  return reason instanceof Error && /[\u0600-\u06ff]/.test(reason.message) ? reason.message : fallback;
}
