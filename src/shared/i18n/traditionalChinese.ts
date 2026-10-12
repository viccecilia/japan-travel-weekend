import type {ConverterFunction} from 'opencc-js';

let converterPromise:Promise<ConverterFunction>|null=null;

async function loadConverter(){
  converterPromise??=Promise.all([
    import('opencc-js/core'),
    import('opencc-js/dict/STCharacters'),
    import('opencc-js/dict/TWVariantsPhrases'),
    import('opencc-js/dict/TWVariants'),
  ]).then(([{ConverterFactory},{default:characters},{default:variantPhrases},{default:variants}])=>ConverterFactory([characters],[variantPhrases,variants]));
  return converterPromise;
}

export async function toTraditionalChinese(value:string){
  if(!value.trim())return value;
  const convert=await loadConverter();
  return convert(value);
}
