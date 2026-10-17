import { i18n } from "@dhtmlx/suite";
export type LanguageConfig={locale:string;languages:Record<string,string>;selector:boolean;messages:Record<string,string>};
let current="hu",messages:Record<string,string>={};
const nativeDefaults:Record<string,Record<string,string>>=Object.fromEntries(["grid","form","window","toolbar","combobox"].map(group=>[group,{...i18n[group]}]));
/** A locale always exists, even when the consumer hides language selection. */
export function configureLanguage(config?:LanguageConfig):void{
  current=config?.locale??"hu";messages=config?.messages??{};
  document.documentElement.lang=current;
  // Suite native message buttons are localized independently of VAPA captions.
  i18n.setLocale("message",{apply:t("Rendben"),reject:t("Mégse"),aria_confirm:t("Megerősítés"),aria_reject:t("Mégse"),aria_apply:t("Rendben")});
  for(const [group,values] of Object.entries(nativeDefaults))i18n.setLocale(group,Object.fromEntries(Object.entries(values).map(([key,value])=>[key,t(value)])));
}
export const locale=()=>current;
export function t(key:string,parameters:Record<string,unknown>={}):string{
  return (messages[key]??key).replace(/\{([\w]+)\}/g,(match,name)=>Object.hasOwn(parameters,name)?String(parameters[name]):match);
}
