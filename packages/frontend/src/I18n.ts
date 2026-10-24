import { i18n } from "@dhtmlx/suite";
export type LanguageConfig={locale:string;languages:Record<string,string>;selector:boolean;flags?:Record<string,string>;messages:Record<string,string>};
let current="hu",messages:Record<string,string>={};
const nativeDefaults:Record<string,Record<string,string>>=Object.fromEntries(["grid","form","window","toolbar","combobox"].map(group=>[group,{...i18n[group]}]));
/** A locale always exists, even when the consumer hides language selection. */
export function configureLanguage(config?:LanguageConfig):void{
  current=config?.locale??"hu";messages=config?.messages??{};
  document.documentElement.lang=current;
  // Suite native message buttons are localized independently of 61de captions.
  i18n.setLocale("message",{apply:t("Rendben"),reject:t("Mégse"),aria_confirm:t("Megerősítés"),aria_reject:t("Mégse"),aria_apply:t("Rendben")});
  for(const [group,values] of Object.entries(nativeDefaults))i18n.setLocale(group,Object.fromEntries(Object.entries(values).map(([key,value])=>[key,t(value)])));
  // Suite Calendar (datepicker popup) month/day names from the browser's locale data; weeks start on Sunday there.
  const names=(options:Intl.DateTimeFormatOptions,dates:Date[])=>dates.map(date=>new Intl.DateTimeFormat(current,options).format(date));
  const months=Array.from({length:12},(_,month)=>new Date(2024,month,1)),days=Array.from({length:7},(_,day)=>new Date(2024,0,7+day));
  i18n.setLocale("calendar",{months:names({month:"long"},months),monthsShort:names({month:"short"},months),days:names({weekday:"long"},days),daysShort:names({weekday:"short"},days),cancel:t("Mégse")});
  i18n.setLocale("timepicker",{hours:t("Óra"),minutes:t("Perc"),save:t("Mentés")});
}
export const locale=()=>current;
export function t(key:string,parameters:Record<string,unknown>={}):string{
  return (messages[key]??key).replace(/\{([\w]+)\}/g,(match,name)=>Object.hasOwn(parameters,name)?String(parameters[name]):match);
}

/** Native Toolbar icon class, backed by bundled PNGs; labels remain plain text. */
export const languageIcon=(config:LanguageConfig,id:string)=>{
 const country=config.flags?.[id];
 return country&&["hu","gb","de"].includes(country)?`blade-language-flag blade-language-flag--${country}`:undefined;
};
