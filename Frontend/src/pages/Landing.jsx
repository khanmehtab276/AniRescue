import { Link } from 'react-router-dom';
import { PawPrint, HardHat, Building2 } from 'lucide-react';
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
    <main className="min-h-screen px-4 pb-24">

      <div className="max-w-md mx-auto">

        {/* Hero — ONE clear action, not a Report+Map button pair */}
        <section className="pt-10 pb-12 text-center">

          <div className="inline-flex items-center justify-center w-16 h-16 mb-6 rounded-2xl bg-emerald-600 text-white">
            <PawPrint size={30} strokeWidth={2.2} />
          </div>

          <p className="mb-3 text-xs font-bold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
            AniRescue
          </p>

          <h1 className="text-4xl md:text-5xl font-extrabold leading-tight text-slate-900 dark:text-slate-100">
            Coordinated
            <span className="block text-emerald-600 dark:text-emerald-400">
              Animal Rescue
            </span>
          </h1>

          <p className="mt-5 text-sm leading-6 text-slate-500 dark:text-slate-400">
            AniRescue connects people who report animal emergencies with
            the volunteers and organizations who respond — backed by
            AI-assisted image validation and a verified rescue workflow
            from report to resolution.
          </p>

          <div className="mt-8">
            {user ? (
              <Button as={Link} to={dashboardPath} size="lg" className="w-full">
                Go to My Dashboard
              </Button>
            ) : (
              <Button as={Link} to="/login" size="lg" className="w-full">
                Get Started
              </Button>
            )}
          </div>

        </section>


        {/* How it works */}
        <section className="mt-4">

          <div className="mb-5 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              How it works
            </p>

            <h2 className="mt-1 text-2xl font-extrabold text-slate-900 dark:text-slate-100">
              From Report to Resolution
            </h2>
          </div>

          <div className="space-y-3">

            <Step
              number="01"
              title="Report"
              description="Anyone can submit an animal's location, description and a photo in under a minute."
            />

            <Step
              number="02"
              title="AI Verification"
              description="Every image is checked to confirm it shows a genuine rescue-eligible animal before it reaches volunteers."
            />

            <Step
              number="03"
              title="Rescue"
              description="A nearby volunteer claims the case, and submits photo evidence once the rescue is complete."
            />

            <Step
              number="04"
              title="Verified Resolution"
              description="An admin or partner organization reviews the evidence before the case is marked resolved — no self-certified rescues."
            />

          </div>

        </section>


        {/* Who it's for */}
        <section className="mt-10">

          <div className="mb-5 text-center">
            <p className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Built for everyone in the loop
            </p>
          </div>

          <div className="space-y-3">

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
          <h3 className="font-bold text-slate-900 dark:text-slate-100">
            {title}
          </h3>

          <p className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
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
        <h3 className="font-bold text-slate-900 dark:text-slate-100">
          {title}
        </h3>

        <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">
          {description}
        </p>
      </div>

    </Surface>
  );
}
