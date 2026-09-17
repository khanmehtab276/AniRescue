import { Link } from 'react-router-dom';

export default function Landing() {
  return (
    <main className="min-h-screen px-4 pb-24">

      <div className="max-w-md mx-auto">

        {/* Hero */}
        <section className="pt-10 pb-12 text-center">

          <div className="inline-flex items-center justify-center w-20 h-20 mb-6 rounded-[2rem] bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[8px_8px_16px_#cbd5e1,_-8px_-8px_16px_#f8fafc] dark:shadow-[8px_8px_16px_#070a13,_-8px_-8px_16px_#172441] text-4xl">
            🐾
          </div>

          <p className="mb-3 text-xs font-extrabold uppercase tracking-[0.2em] text-emerald-600 dark:text-emerald-400">
            AniRescue
          </p>

          <h1 className="text-4xl md:text-5xl font-black leading-tight text-gray-800 dark:text-gray-100">
            AI-Powered
            <span className="block text-emerald-600 dark:text-emerald-400">
              Animal Rescue
            </span>
          </h1>

          <p className="mt-4 text-xl font-extrabold text-gray-700 dark:text-gray-200">
            When Seconds Count.
          </p>

          <p className="mt-5 text-sm leading-6 text-gray-500 dark:text-gray-400">
            AniRescue helps people report injured animals with
            location and images, validates rescue cases using AI,
            and connects verified cases with nearby volunteers
            for faster response.
          </p>

          <div className="mt-8 space-y-3">

            <Link
              to="/report"
              className="flex items-center justify-center w-full py-4 rounded-2xl bg-emerald-600 text-white font-extrabold shadow-lg hover:-translate-y-0.5 transition-all"
            >
              🚨 Report Emergency
            </Link>

            <Link
              to="/map"
              className="flex items-center justify-center w-full py-4 rounded-2xl bg-[#e2e8f0] dark:bg-[#0f172a] text-gray-700 dark:text-gray-200 font-extrabold shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441] hover:-translate-y-0.5 transition-all"
            >
              🗺️ View Live Map
            </Link>

          </div>

        </section>


        {/* Features */}
        <section className="space-y-4">

          <FeatureCard
            icon="🤖"
            title="AI Image Validation"
            description="Submitted animal images can be processed by the AI worker to help validate whether a reported case requires rescue attention."
          />

          <FeatureCard
            icon="📍"
            title="Real-Time Location"
            description="Capture the rescue location using GPS or select a custom location so volunteers can find the reported animal."
          />

          <FeatureCard
            icon="🦺"
            title="Nearby Volunteer Dispatch"
            description="Verified rescue cases can be matched with registered volunteers located within the supported response radius."
          />

        </section>


        {/* How it works */}
        <section className="mt-10">

          <div className="mb-5 text-center">
            <p className="text-xs font-extrabold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">
              Simple workflow
            </p>

            <h2 className="mt-1 text-2xl font-extrabold text-gray-800 dark:text-gray-100">
              How AniRescue Works
            </h2>
          </div>

          <div className="space-y-3">

            <Step
              number="01"
              title="Report"
              description="Submit the animal's location, description and image."
            />

            <Step
              number="02"
              title="Validate"
              description="The rescue case is processed through the AI validation workflow."
            />

            <Step
              number="03"
              title="Connect"
              description="Verified cases become available to registered volunteers."
            />

            <Step
              number="04"
              title="Rescue"
              description="A volunteer can claim the case and update its rescue status."
            />

          </div>

        </section>


        {/* Bottom CTA */}
        <section className="mt-10 p-6 rounded-[2rem] text-center bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[8px_8px_16px_#cbd5e1,_-8px_-8px_16px_#f8fafc] dark:shadow-[8px_8px_16px_#070a13,_-8px_-8px_16px_#172441]">

          <div className="text-3xl mb-3">
            🐕
          </div>

          <h2 className="text-xl font-extrabold text-gray-800 dark:text-gray-100">
            See an animal in need?
          </h2>

          <p className="mt-2 text-sm leading-6 text-gray-500 dark:text-gray-400">
            Report the situation and help connect the case
            with the rescue network.
          </p>

          <Link
            to="/report"
            className="inline-flex items-center justify-center mt-5 px-6 py-3 rounded-xl bg-emerald-600 text-white font-bold shadow-lg hover:-translate-y-0.5 transition-all"
          >
            Report a Rescue Case
          </Link>

        </section>

      </div>
    </main>
  );
}


/* =========================================================
   FEATURE CARD
========================================================= */

function FeatureCard({
  icon,
  title,
  description
}) {
  return (
    <div className="p-5 rounded-2xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[6px_6px_12px_#cbd5e1,_-6px_-6px_12px_#f8fafc] dark:shadow-[6px_6px_12px_#070a13,_-6px_-6px_12px_#172441]">

      <div className="flex items-start gap-4">

        <div className="w-12 h-12 shrink-0 rounded-xl flex items-center justify-center text-2xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[inset_3px_3px_6px_#cbd5e1,inset_-3px_-3px_6px_#f8fafc] dark:shadow-[inset_3px_3px_6px_#070a13,inset_-3px_-3px_6px_#172441]">
          {icon}
        </div>

        <div>
          <h3 className="font-extrabold text-gray-800 dark:text-gray-100">
            {title}
          </h3>

          <p className="mt-1 text-sm leading-6 text-gray-500 dark:text-gray-400">
            {description}
          </p>
        </div>

      </div>

    </div>
  );
}


/* =========================================================
   WORKFLOW STEP
========================================================= */

function Step({
  number,
  title,
  description
}) {
  return (
    <div className="flex items-center gap-4 p-4 rounded-2xl bg-[#e2e8f0] dark:bg-[#0f172a] shadow-[5px_5px_10px_#cbd5e1,_-5px_-5px_10px_#f8fafc] dark:shadow-[5px_5px_10px_#070a13,_-5px_-5px_10px_#172441]">

      <div className="w-11 h-11 shrink-0 rounded-xl flex items-center justify-center bg-emerald-600 text-white text-xs font-black">
        {number}
      </div>

      <div>
        <h3 className="font-extrabold text-gray-800 dark:text-gray-100">
          {title}
        </h3>

        <p className="mt-1 text-xs leading-5 text-gray-500 dark:text-gray-400">
          {description}
        </p>
      </div>

    </div>
  );
}