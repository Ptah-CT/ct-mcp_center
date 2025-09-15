import { useParams } from "next/navigation";

import { SUPPORTED_LOCALES, SupportedLocale } from "@/lib/i18n";

export function useLocale(): SupportedLocale {
  const params = useParams();
  
  // Get locale from URL params (available both server and client)
  const locale = params?.locale as SupportedLocale;
  
  // Return the locale if it's supported, otherwise default to "en"
  return SUPPORTED_LOCALES.includes(locale) ? locale : "en";
}
