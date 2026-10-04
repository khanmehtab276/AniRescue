import { Link } from 'react-router-dom';
import { PawPrint, HardHat, Building2, Camera, ShieldCheck, HeartHandshake } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import Surface from '../components/ui/Surface.jsx';
import Button from '../components/ui/Button.jsx';

const DASHBOARD_PATH = {
  user: '/dashboard',
  volunteer: '/volunteer',
  ngo: '/ngo',
  admin: '/admin',
};

export default function Landing() {
  const { user } = useAuth();

  const role = (user?.role || '').toLowerCase();
  const dashboardPath = DASHBOARD_PATH[role] || '/dashboard';

  return (
    <main className="relative min-h-screen px-4 pb-24 overflow-hidden">

      {/* Warm wash behind the hero — decorative only */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-[520px]">
        <div className="absolute -top-24 -left-24 w-[420px] h-[420px] rounded-full bg-emerald-200/50 dark:bg-emerald-900/20 blur-3xl" />
        <div className="absolute top-10 -right-24 w-[360px] h-[360px] rounded-full bg-amber-200/50 dark:bg-amber-900/15 blur-3xl" />
      </div>

      <div className="relative max-w-md md:max-w-4xl mx-auto">

        {/* Hero — ONE clear action, not a Report+Map button pair */}
        <section className="pt-10 pb-12 text-center animate-rescue-fade-up">

          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-2xl bg-emerald-600 text-white shadow-sm">
            <PawPrint size={30} strokeWidth={2.2} aria-hidden="true" />
          </div>

          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-emerald-700 dark:text-emerald-400">
            AniRescue
          </p>

          <h1 className="text-4xl md:text-6xl font-extrabold leading-tight text-stone-900 dark:text-stone-100">
            Every report can help 🐾
            <span className="block text-emerald-700 dark:text-emerald-400">
              save an animal.
            </span>
          </h1>

          <p className="mt-5 mx-auto max-w-xl text-sm md:text-base leading-6 text-stone-600 dark:text-stone-400">
            AniRescue connects people who spot an animal in trouble with the
            volunteers and organizations who can help — with an AI check on
            every photo and a verified outcome for every rescue.
          </p>

          <div className="mt-8 mx-auto max-w-xs">
            {user ? (
              <Button as={Link} to={dashboardPath} size="lg" className="w-full">
                Go to My Dashboard
              </Button>
            ) : (
              <Button as={Link} to="/login" size="lg" className="w-full">
                Get started — let’s help
              </Button>
            )}
          </div>

          {/* The journey, at a glance */}
          <ol
            aria-label="How a report becomes a rescue"
            className="mt-12 mx-auto max-w-xl flex items-start justify-center gap-2 sm:gap-4 rescue-stagger"
          >
            <JourneyStop Icon={Camera} label="Report" />
            <JourneyLink />
            <JourneyStop Icon={ShieldCheck} label="Verified" />
            <JourneyLink />
            <JourneyStop Icon={HeartHandshake} label="Rescued" />
          </ol>

        </section>


        {/* How it works */}
        <section className="mt-4">

          <div className="mb-5 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              How it works
            </p>

            <h2 className="mt-1 text-2xl font-extrabold text-stone-900 dark:text-stone-100">
              From report to rescue
            </h2>
          </div>

          <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-2 md:gap-3">

            <Step
              number="01"
              title="Report"
              description="Share a photo, where you saw the animal, and what happened. We’ll guide you from there."
            />

            <Step
              number="02"
              title="AI Verification"
              description="A quick AI check helps keep the rescue queue focused on real animal cases."
            />

            <Step
              number="03"
              title="Rescue"
              description="A nearby responder can pick up the case and keep the rescue status updated."
            />

            <Step
              number="04"
              title="Verified Resolution"
              description="The completed rescue is reviewed before the case is finally marked resolved. 💚"
            />

          </div>

        </section>


        {/* Who it's for */}
        <section className="mt-10">

          <div className="mb-5 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Everyone has a part to play
            </p>
          </div>

          <div className="space-y-3 md:space-y-0 md:grid md:grid-cols-3 md:gap-3">

            <FeatureCard
              Icon={PawPrint}
              title="Reporters"
              description="Track exactly what's happening with the animal you reported, from AI review to final resolution."
            />

            <FeatureCard
              Icon={HardHat}
              title="Volunteers"
              description="See eligible rescue cases near you, claim one, and hand off with photo evidence when the job is done."
            />

            <FeatureCard
              Icon={Building2}
              title="Partner Organizations"
              description="Monitor active cases in your operating area and verify rescue outcomes reported by volunteers."
            />

          </div>

        </section>

      </div>
    </main>
  );
}


/* =========================================================
   FEATURE CARD
========================================================= */

function FeatureCard({ Icon, title, description }) {
  return (
    <Surface className="p-5">
      <div className="flex items-start gap-4">

        <Surface variant="subtle" className="w-12 h-12 shrink-0 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
          <Icon size={22} strokeWidth={2} />
        </Surface>

        <div>
          <h3 className="font-bold text-stone-900 dark:text-stone-100">
            {title}
          </h3>

          <p className="mt-1 text-sm leading-6 text-stone-500 dark:text-stone-400">
            {description}
          </p>
        </div>

      </div>
    </Surface>
  );
}


/* =========================================================
   WORKFLOW STEP
========================================================= */

function Step({ number, title, description }) {
  return (
    <Surface className="flex items-center gap-4 p-4">

      <div className="w-10 h-10 shrink-0 rounded-xl flex items-center justify-center bg-emerald-600 text-white text-xs font-bold">
        {number}
      </div>

      <div>
        <h3 className="font-bold text-stone-900 dark:text-stone-100">
          {title}
        </h3>

        <p className="mt-1 text-xs leading-5 text-stone-500 dark:text-stone-400">
          {description}
        </p>
      </div>

    </Surface>
  );
}


/* =========================================================
   JOURNEY (hero)
========================================================= */

function JourneyStop({ Icon, label }) {
  return (
    <li className="flex flex-col items-center gap-2 w-20">
      <span className="w-14 h-14 rounded-2xl flex items-center justify-center bg-white dark:bg-stone-900 border border-stone-200 dark:border-stone-800 shadow-sm text-emerald-700 dark:text-emerald-400">
        <Icon size={24} strokeWidth={2} aria-hidden="true" />
      </span>
      <span className="text-xs font-bold text-stone-700 dark:text-stone-300">
        {label}
      </span>
    </li>
  );
}

function JourneyLink() {
  return (
    <li aria-hidden="true" className="mt-7 h-px w-6 sm:w-12 bg-emerald-600/40" />
  );
}
