import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Panel,
  PanelHeader,
} from "@/components/common/Primitives";

import { StepFooter } from "./PlannerLayout";

import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

import { cn } from "@/lib/utils";

import {
  Home,
  Building2,
  Factory,
  MapPin,
  BriefcaseBusiness,
  Clock3,
  Zap,
  Save,
  RotateCcw,
} from "lucide-react";

import { toast } from "sonner";

import { useCreateProject } from "@/lib/projectApi";
import { useProjectContext } from "@/context/ProjectContext";


/* =========================================================
   CONSUMER TYPES
========================================================= */

const TYPES = [
  {
    key: "Residential",
    icon: Home,
    title: "Residential",
    desc: "Homes, villas & apartments",
  },
  {
    key: "Commercial",
    icon: Building2,
    title: "Commercial",
    desc: "Offices, retail & services",
  },
  {
    key: "Industrial",
    icon: Factory,
    title: "Industrial",
    desc: "Plants, warehouses & production",
  },
];


/* =========================================================
   TYPE-SPECIFIC QUESTIONS
========================================================= */

const PROFILE_OPTIONS = {

  Residential: {
    title: "Home profile",
    description:
      "Only the basic site information that helps SolarIQ+ understand the installation context.",

    fields: [
      {
        key: "propertyType",
        label: "Property type",
        options: [
          "Independent House",
          "Villa",
          "Apartment / Society",
        ],
      },

      {
        key: "roofType",
        label: "Roof type",
        options: [
          "RCC / Flat",
          "Sloped",
          "Mixed",
          "Not sure",
        ],
      },

      {
        key: "floors",
        label: "Number of floors",
        options: [
          "1",
          "2",
          "3",
          "4+",
        ],
      },
    ],
  },


  Commercial: {
    title: "Business profile",
    description:
      "Commercial sites have different load patterns, so we capture only useful planning context.",

    fields: [
      {
        key: "businessType",
        label: "Business type",
        options: [
          "Office",
          "Retail",
          "Restaurant",
          "Hotel",
          "Other",
        ],
      },

      {
        key: "operatingHours",
        label: "Typical operating hours",
        options: [
          "Up to 8 hours",
          "8–12 hours",
          "12–16 hours",
          "16–24 hours",
        ],
      },

      {
        key: "sanctionedLoad",
        label: "Sanctioned load (kW)",
        number: true,
        optional: true,
      },
    ],
  },


  Industrial: {
    title: "Industrial profile",
    description:
      "Industrial sites can have higher demand, so the profile includes load and operating pattern.",

    fields: [
      {
        key: "industryType",
        label: "Industry type",
        options: [
          "Manufacturing",
          "Warehouse",
          "Processing",
          "Cold storage",
          "Other",
        ],
      },

      {
        key: "operatingSchedule",
        label: "Operating schedule",
        options: [
          "Day shift",
          "Two shifts",
          "24×7",
          "Variable",
        ],
      },

      {
        key: "connectedLoad",
        label: "Connected load (kW)",
        number: true,
        optional: true,
      },

      {
        key: "threePhase",
        label: "Three-phase supply",
        options: [
          "Yes",
          "No",
          "Not sure",
        ],
      },
    ],
  },
};


/* =========================================================
   HELPERS
========================================================= */

function profileDefaults(type) {

  return Object.fromEntries(
    PROFILE_OPTIONS[type].fields.map(
      (field) => [field.key, ""]
    )
  );
}


function storedProfile(id, type) {

  if (!id) {
    return profileDefaults(type);
  }

  try {

    const raw =
      localStorage.getItem(
        `siq_site_profile_${id}`
      );

    const parsed =
      raw
        ? JSON.parse(raw)
        : null;

    if (
      parsed?.type === type
    ) {
      return {
        ...profileDefaults(type),
        ...parsed.profile,
      };
    }

  } catch {
    // Ignore storage errors.
  }

  return profileDefaults(type);
}


/* =========================================================
   COMPONENT
========================================================= */

export default function PlannerProject() {

  const {
    activeProject,
    activeProjectId,
    setActiveProject,
  } = useProjectContext();


  const createProject =
    useCreateProject();


  const [type, setType] =
    useState(
      activeProject?.consumer_type ||
        activeProject?.consumerType ||
        "Residential"
    );


  const [form, setForm] =
    useState({
      name:
        activeProject?.name ||
        "",

      location:
        activeProject?.location ||
        "",

      notes:
        activeProject?.notes ||
        "",
    });


  const [profile, setProfile] =
    useState(() =>
      storedProfile(
        activeProjectId,
        activeProject?.consumer_type ||
          activeProject?.consumerType ||
          "Residential"
      )
    );


  /* =======================================================
     LOAD ACTIVE PROJECT
  ======================================================= */

  useEffect(() => {

    if (!activeProject) {
      return;
    }

    const nextType =
      activeProject.consumer_type ||
      activeProject.consumerType ||
      "Residential";


    setType(nextType);


    setForm({
      name:
        activeProject.name ||
        "",

      location:
        activeProject.location ||
        "",

      notes:
        activeProject.notes ||
        "",
    });


    setProfile(
      storedProfile(
        activeProjectId,
        nextType
      )
    );

  }, [
    activeProject,
    activeProjectId,
  ]);


  const config =
    PROFILE_OPTIONS[type];


  const profileComplete =
    useMemo(
      () =>
        config.fields.every(
          (field) =>
            field.optional ||
            Boolean(profile[field.key])
        ),
      [
        config,
        profile,
      ]
    );


  /* =======================================================
     FORM UPDATES
  ======================================================= */

  const updateForm =
    (key, value) => {

      setForm(
        (current) => ({
          ...current,
          [key]: value,
        })
      );
    };


  const updateProfile =
    (key, value) => {

      setProfile(
        (current) => ({
          ...current,
          [key]: value,
        })
      );
    };


  const selectType =
    (nextType) => {

      setType(nextType);

      setProfile(
        storedProfile(
          activeProjectId,
          nextType
        )
      );
    };


  /* =======================================================
     RESET
  ======================================================= */

  const resetForm = () => {

    setForm({
      name: "",
      location: "",
      notes: "",
    });

    setProfile(
      profileDefaults(type)
    );
  };


  /* =======================================================
     SAVE
  ======================================================= */

  const save = async () => {

    const name =
      form.name.trim();

    const location =
      form.location.trim();


    if (!name) {

      toast.error(
        "Project name is required"
      );

      return;
    }


    if (!location) {

      toast.error(
        "Project location is required"
      );

      return;
    }


    try {

      const created =
        await createProject.mutateAsync({

          name,

          consumer_type:
            type,

          location,

          capacity_kw:
            null,

          roof_area_m2:
            null,

          roof_tilt_deg:
            null,

          system_status:
            "Planning",

          installation_date:
            null,

          monitoring_start_date:
            null,

          inverter_brand:
            null,

          inverter_model:
            null,

          panel_brand:
            null,

          panel_wattage_w:
            null,

          panel_count:
            null,

          notes:
            form.notes.trim(),
        });


      const snapshot = {

        name,

        consumer_type:
          type,

        location,

        capacity_kw:
          null,

        roof_area_m2:
          null,

        roof_tilt_deg:
          null,

        system_status:
          "Planning",

        notes:
          form.notes.trim(),
      };


      try {

        localStorage.setItem(
          "siq_project_registration_snapshot",
          JSON.stringify(snapshot)
        );


        localStorage.setItem(

          `siq_site_profile_${
            created.id ||
            created._id ||
            activeProjectId ||
            "draft"
          }`,

          JSON.stringify({

            type,

            profile,

            updatedAt:
              new Date().toISOString(),

          })
        );


        localStorage.removeItem(
          "siq_user_mode"
        );

      } catch {
        // Ignore storage errors.
      }


      setActiveProject({
        ...created,
        ...snapshot,
      });


      toast.success(
        "Project saved",
        {
          description:
            `${name} · ${type}`,
        }
      );

    } catch (err) {

      toast.error(
        "Could not save project",
        {
          description:
            err?.response?.data?.detail ||
            "Please check the project details and try again.",
        }
      );

    }
  };


  /* =======================================================
     UI
  ======================================================= */

  return (

    <div className="space-y-5">

      {/* ===================================================
          INTRO
      =================================================== */}

      <section
        className="
          rounded-2xl
          border
          border-emerald-100
          bg-gradient-to-r
          from-emerald-50
          via-white
          to-white
          p-5
          sm:p-6
          shadow-sm
        "
      >

        <div className="flex items-start gap-4">

          <div
            className="
              flex
              h-12
              w-12
              shrink-0
              items-center
              justify-center
              rounded-2xl
              bg-emerald-600
              text-white
              shadow-md
            "
          >
            <Home className="h-6 w-6" />
          </div>


          <div>

            <div
              className="
                text-[10px]
                font-bold
                uppercase
                tracking-[0.18em]
                text-emerald-700
              "
            >
              Step 01 · Project
            </div>


            <h2
              className="
                mt-1
                text-xl
                font-extrabold
                tracking-tight
                text-slate-950
              "
            >
              Tell us about the site
            </h2>


            <p
              className="
                mt-1
                max-w-3xl
                text-sm
                leading-6
                text-slate-500
              "
            >
              Start with the information SolarIQ+
              actually needs. Electricity usage will
              be collected from the bill in the next step.
            </p>

          </div>

        </div>

      </section>


      {/* ===================================================
          CONSUMER TYPE
      =================================================== */}

      <Panel className="overflow-hidden">

        <PanelHeader
          title="Who is this solar system for?"
          hint="Choose the site type to see the relevant questions."
        />


        <div
          className="
            grid
            gap-3
            p-5
            md:grid-cols-3
          "
        >

          {TYPES.map((item) => {

            const Icon =
              item.icon;

            const active =
              type === item.key;


            return (

              <button
                key={item.key}
                type="button"
                onClick={() =>
                  selectType(item.key)
                }
                className={cn(
                  `
                    relative
                    rounded-2xl
                    border
                    p-5
                    text-left
                    transition-all
                  `,

                  active
                    ? `
                      border-emerald-500
                      bg-emerald-600
                      text-white
                      shadow-lg
                    `
                    : `
                      border-slate-200
                      bg-white
                      hover:-translate-y-0.5
                      hover:border-emerald-300
                      hover:bg-emerald-50/40
                    `
                )}
              >

                {active && (

                  <span
                    className="
                      absolute
                      right-4
                      top-4
                      rounded-full
                      bg-white
                      px-2
                      py-1
                      text-[9px]
                      font-bold
                      uppercase
                      text-emerald-700
                    "
                  >
                    Selected
                  </span>

                )}


                <div
                  className={cn(
                    `
                      flex
                      h-10
                      w-10
                      items-center
                      justify-center
                      rounded-xl
                    `,

                    active
                      ? "bg-white/15 text-white"
                      : "bg-emerald-50 text-emerald-600"
                  )}
                >
                  <Icon className="h-5 w-5" />
                </div>


                <div className="mt-4 font-extrabold text-sm">
                  {item.title}
                </div>


                <div
                  className={cn(
                    "mt-1 text-xs",
                    active
                      ? "text-emerald-50"
                      : "text-slate-500"
                  )}
                >
                  {item.desc}
                </div>

              </button>

            );

          })}

        </div>

      </Panel>


      {/* ===================================================
          CORE DETAILS
      =================================================== */}

      <Panel className="overflow-hidden">

        <PanelHeader
          title="Project details"
          hint="Only project name and location are required at this stage."
        />


        <div
          className="
            grid
            gap-5
            p-5
            md:grid-cols-2
          "
        >

          {/* PROJECT NAME */}

          <div>

            <Label
              className="
                text-xs
                font-bold
                uppercase
                tracking-wider
                text-slate-600
              "
            >
              Project name
              <span className="text-emerald-600">
                {" "}*
              </span>
            </Label>


            <div className="relative mt-1.5">

              <BriefcaseBusiness
                className="
                  pointer-events-none
                  absolute
                  left-3
                  top-1/2
                  h-4
                  w-4
                  -translate-y-1/2
                  text-slate-400
                "
              />


              <Input
                value={form.name}
                onChange={(e) =>
                  updateForm(
                    "name",
                    e.target.value
                  )
                }
                className="
                  h-11
                  rounded-xl
                  pl-10
                "
                placeholder="e.g. My Home Solar"
              />

            </div>

          </div>


          {/* LOCATION */}

          <div>

            <Label
              className="
                text-xs
                font-bold
                uppercase
                tracking-wider
                text-slate-600
              "
            >
              Project location
              <span className="text-emerald-600">
                {" "}*
              </span>
            </Label>


            <div className="relative mt-1.5">

              <MapPin
                className="
                  pointer-events-none
                  absolute
                  left-3
                  top-1/2
                  h-4
                  w-4
                  -translate-y-1/2
                  text-slate-400
                "
              />


              <Input
                value={form.location}
                onChange={(e) =>
                  updateForm(
                    "location",
                    e.target.value
                  )
                }
                className="
                  h-11
                  rounded-xl
                  pl-10
                "
                placeholder="City, State, Country"
              />

            </div>

          </div>

        </div>

      </Panel>


      {/* ===================================================
          PROFILE
      =================================================== */}

      <Panel className="overflow-hidden">

        <PanelHeader
          title={config.title}
          hint={config.description}

          right={

            <span
              className={cn(
                `
                  hidden
                  sm:inline-flex
                  items-center
                  rounded-full
                  px-2.5
                  py-1
                  text-[10px]
                  font-bold
                  uppercase
                `,

                profileComplete
                  ? "bg-emerald-50 text-emerald-700"
                  : "bg-slate-100 text-slate-500"
              )}
            >
              {profileComplete
                ? "Profile ready"
                : "Optional details"}
            </span>

          }
        />


        <div
          className="
            grid
            gap-4
            p-5
            md:grid-cols-2
            lg:grid-cols-3
          "
        >

          {config.fields.map(
            (field) => (

              <div key={field.key}>

                <Label
                  className="
                    text-xs
                    font-bold
                    uppercase
                    tracking-wider
                    text-slate-600
                  "
                >
                  {field.label}
                </Label>


                {field.number ? (

                  <Input
                    type="number"
                    min="0"
                    step="0.1"
                    value={
                      profile[field.key] || ""
                    }
                    onChange={(e) =>
                      updateProfile(
                        field.key,
                        e.target.value
                      )
                    }
                    className="
                      mt-1.5
                      h-11
                      rounded-xl
                    "
                    placeholder="Optional"
                  />

                ) : (

                  <select
                    value={
                      profile[field.key] || ""
                    }
                    onChange={(e) =>
                      updateProfile(
                        field.key,
                        e.target.value
                      )
                    }
                    className="
                      mt-1.5
                      h-11
                      w-full
                      rounded-xl
                      border
                      border-slate-200
                      bg-white
                      px-3
                      text-sm
                      text-slate-700
                      outline-none
                      focus:border-emerald-400
                      focus:ring-2
                      focus:ring-emerald-100
                    "
                  >

                    <option value="">
                      Select
                    </option>

                    {field.options.map(
                      (option) => (

                        <option
                          key={option}
                          value={option}
                        >
                          {option}
                        </option>

                      )
                    )}

                  </select>

                )}


                <div
                  className="
                    mt-1.5
                    flex
                    items-center
                    gap-1.5
                    text-[10px]
                    text-slate-400
                  "
                >

                  {field.number ? (
                    <Zap className="h-3 w-3" />
                  ) : field.key
                    .toLowerCase()
                    .includes("hour") ||
                    field.key
                      .toLowerCase()
                      .includes("schedule") ? (
                    <Clock3 className="h-3 w-3" />
                  ) : (
                    <Home className="h-3 w-3" />
                  )}

                  {field.number
                    ? "Optional — enter only if known."
                    : "Select the closest match."}

                </div>

              </div>

            )
          )}

        </div>

      </Panel>


      {/* ===================================================
          NOTES
      =================================================== */}

      <Panel className="overflow-hidden">

        <PanelHeader
          title="Additional notes"
          hint="Optional — add anything important about the site."
        />


        <div className="p-5">

          <Textarea
            value={form.notes}
            onChange={(e) =>
              updateForm(
                "notes",
                e.target.value
              )
            }
            rows={3}
            className="
              resize-none
              rounded-xl
            "
            placeholder="Example: roof is partly shaded in the afternoon..."
          />

        </div>

      </Panel>


      {/* ===================================================
          ACTIONS
      =================================================== */}

      <div
        className="
          rounded-2xl
          border
          border-slate-200
          bg-white
          p-4
          shadow-sm
        "
      >

        <div
          className="
            flex
            flex-col
            gap-3
            sm:flex-row
            sm:items-center
            sm:justify-between
          "
        >

          <div className="text-xs text-slate-500">

            <span className="font-semibold text-slate-700">
              Next:
            </span>{" "}

            upload the electricity bill to calculate
            energy-use inputs.

          </div>


          <div
            className="
              flex
              flex-col-reverse
              gap-2
              sm:flex-row
            "
          >

            <button
              type="button"
              onClick={resetForm}
              className="
                inline-flex
                items-center
                justify-center
                gap-2
                rounded-xl
                border
                border-slate-200
                bg-white
                px-4
                py-2.5
                text-sm
                font-semibold
                text-slate-600
                hover:bg-slate-50
              "
            >
              <RotateCcw className="h-4 w-4" />
              Reset
            </button>


            <button
              type="button"
              disabled={
                createProject.isPending
              }
              onClick={save}
              className="
                inline-flex
                items-center
                justify-center
                gap-2
                rounded-xl
                bg-emerald-600
                px-5
                py-2.5
                text-sm
                font-extrabold
                text-white
                shadow-sm
                hover:bg-emerald-700
                disabled:cursor-not-allowed
                disabled:opacity-60
              "
            >

              <Save className="h-4 w-4" />

              {createProject.isPending
                ? "Saving…"
                : "Save & Continue"}

            </button>

          </div>

        </div>

      </div>


      {/* ===================================================
          PLANNER FOOTER
      =================================================== */}

      <StepFooter
        nextTo="/planner/bill"
        nextLabel={
          activeProject
            ? "Continue to Bill Analysis"
            : "Save project first"
        }
        disabled={!activeProject}
      />

    </div>
  );
}