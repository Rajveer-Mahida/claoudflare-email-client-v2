import { SignIn } from "@clerk/clerk-react";
import { Logomark } from "@/components/Logomark";

/** Signed-out gate: Driftmail branding above Clerk's hosted sign-in / sign-up. */
export function AuthScreen() {
  return (
    <div className="grid min-h-full place-items-center bg-bg px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <div className="mx-auto mb-5 grid h-14 w-14 place-items-center rounded-2xl bg-accent text-accent-fg shadow-[var(--shadow-md)]">
            <Logomark size={30} />
          </div>
          <h1 className="font-display text-3xl font-semibold tracking-tight">Driftmail</h1>
          <p className="mt-1.5 text-sm text-muted">Your private inbox, beautifully quiet.</p>
        </div>
        <div className="flex justify-center">
          <SignIn
            routing="virtual"
            appearance={{
              variables: {
                colorPrimary: "#b4632a",
                fontFamily: "var(--font-sans)",
                borderRadius: "var(--radius)",
              },
            }}
          />
        </div>
      </div>
    </div>
  );
}
