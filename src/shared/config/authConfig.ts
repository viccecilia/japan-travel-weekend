export const passwordRules={minLength:12,requireUppercase:true,requireLowercase:true,requireNumber:true} as const;
export const passwordRuleText='至少 12 个字符，并包含大写字母、小写字母和数字';
export function validatePassword(password:string){return password.length>=passwordRules.minLength&&/[A-Z]/.test(password)&&/[a-z]/.test(password)&&/\d/.test(password)}
