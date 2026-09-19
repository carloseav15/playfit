import { AppEntry } from "@/components/playfit/app-entry";
import { isReturningVisitor } from "@/lib/returning-visitor";

export default async function PlayLayout({ children }: { children: React.ReactNode }) {
  const initiallyActive = await isReturningVisitor();
  return <AppEntry initiallyActive={initiallyActive}>{children}</AppEntry>;
}
