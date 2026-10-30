import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";

import {

  CalendarDays,

  CheckCircle2,

  Clock3,

  Plus,

  RotateCcw,

  Trash2,

  Wrench,

  AlertTriangle,

  ShieldCheck,

  ChevronDown,

} from "lucide-react";



const INITIAL_TASKS = [

  {

    id: 1,

    title: "Panel Cleaning",

    category: "Panels",

    priority: "Medium",

    frequency: "Monthly",

    dueDate: "",

    status: "Recommended",

    description:

      "Inspect panels for dust, leaves, bird droppings and other surface deposits.",

  },

  {

    id: 2,

    title: "Inverter Inspection",

    category: "Inverter",

    priority: "High",

    frequency: "Quarterly",

    dueDate: "",

    status: "Recommended",

    description:

      "Check inverter operating status, ventilation area and warning indicators.",

  },

  {

    id: 3,

    title: "Generation Performance Review",

    category: "Performance",

    priority: "Medium",

    frequency: "Monthly",

    dueDate: "",

    status: "Recommended",

    description:

      "Review recent generation and look for persistent drops compared with the normal pattern.",

  },

  {

    id: 4,

    title: "Electrical Safety Inspection",

    category: "Electrical",

    priority: "High",

    frequency: "Yearly",

    dueDate: "",

    status: "Recommended",

    description:

      "Inspect accessible electrical equipment and connections through a qualified technician.",

  },

];



function getToday() {

  return new Date().toISOString().split("T")[0];

}



function formatDate(value) {

  if (!value) return "Not scheduled";



  const date = new Date(`${value}T00:00:00`);



  if (Number.isNaN(date.getTime())) {

    return value;

  }



  return date.toLocaleDateString("en-IN", {

    day: "2-digit",

    month: "short",

    year: "numeric",

  });

}



function getDueState(task) {

  if (task.status === "Completed") {

    return "completed";

  }



  if (!task.dueDate) {

    return "recommended";

  }



  const today = getToday();




  if (task.dueDate < today) {

    return "overdue";

  }



  if (task.dueDate === today) {

    return "today";

  }



  return "upcoming";

}



function PriorityBadge({ priority }) {

  const styles = {

    High: "border-red-200 bg-red-50 text-red-700",

    Medium: "border-amber-200 bg-amber-50 text-amber-700",

    Low: "border-emerald-200 bg-emerald-50 text-emerald-700",

  };



  return (

    <span

      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${

        styles[priority] || styles.Medium

      }`}

    >

      {priority}

    </span>

  );

}



function StatusBadge({ task }) {

  const state = getDueState(task);



  const config = {

    completed: {

      label: "Completed",

      className: "border-emerald-200 bg-emerald-50 text-emerald-700",

    },

    overdue: {

      label: "Overdue",

      className: "border-red-200 bg-red-50 text-red-700",

    },

    today: {

      label: "Due Today",

      className: "border-amber-200 bg-amber-50 text-amber-700",

    },

    upcoming: {

      label: "Scheduled",

      className: "border-blue-200 bg-blue-50 text-blue-700",

    },

    recommended: {

      label: "Recommended",

      className: "border-slate-200 bg-slate-100 text-slate-600",

    },

  };



  const item = config[state];



  return (

    <span

      className={`rounded-full border px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${item.className}`}

    >

      {item.label}

    </span>

  );

}



function StatCard({ icon: Icon, label, value, description, iconClass }) {

  return (

    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">

      <div className="flex items-center gap-3">

        <div

          className={`flex h-11 w-11 items-center justify-center rounded-xl ${iconClass}`}

        >

          <Icon className="h-5 w-5" />

        </div>



        <div>

          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">

            {label}

          </div>



          <div className="mt-1 text-2xl font-extrabold text-slate-950">

            {value}

          </div>

        </div>

      </div>



      <p className="mt-3 text-xs leading-5 text-slate-500">

        {description}

      </p>

    </div>

  );

}



export default function Maintenance() {

    const location = useLocation();
  const navigate = useNavigate();

const [tasks, setTasks] = useState(INITIAL_TASKS);

  const [filter, setFilter] = useState("All");

  const [showAddForm, setShowAddForm] = useState(false);



    const [aiPrefillNotice, setAiPrefillNotice] = useState("");

const [newTask, setNewTask] = useState({

    title: "",

    category: "Panels",

    priority: "Medium",

    frequency: "Monthly",

    dueDate: "",

    description: "",

  });



  const today = getToday();

  useEffect(() => {
    const recommendation = location.state?.maintenanceTask;

    if (!recommendation) return;

    setNewTask({
      title: recommendation.title || "",
      category: recommendation.category || "Inspection",
      priority: recommendation.priority || "Medium",
      frequency: recommendation.frequency || "One-time",
      dueDate: "",
      description:
        recommendation.description ||
        "Maintenance task recommended by SolarIQ+ AI diagnosis.",
    });

    setShowAddForm(true);
    setAiPrefillNotice(
      `AI diagnosis recommended: ${recommendation.title || "maintenance task"}`
    );

    navigate(location.pathname, { replace: true, state: null });
  }, [location, navigate]);




  const statistics = useMemo(() => {

    const completed = tasks.filter(

      (task) => task.status === "Completed"

    ).length;



    const overdue = tasks.filter(

      (task) => getDueState(task) === "overdue"

    ).length;



    const scheduled = tasks.filter(

      (task) =>

        task.status !== "Completed" &&

        task.dueDate

    ).length;



    const recommended = tasks.filter(

      (task) =>

        task.status !== "Completed" &&

        !task.dueDate

    ).length;



    return {

      total: tasks.length,

      completed,

      overdue,

      scheduled,

      recommended,

    };

  }, [tasks]);



  const filteredTasks = useMemo(() => {

    let result = [...tasks];



    if (filter === "Scheduled") {

      result = result.filter(

        (task) =>

          task.status !== "Completed" &&

          task.dueDate

      );

    }



    if (filter === "Pending") {

      result = result.filter(

        (task) => task.status !== "Completed"

      );

    }



    if (filter === "Completed") {

      result = result.filter(

        (task) => task.status === "Completed"

      );

    }



    if (filter === "Overdue") {

      result = result.filter(

        (task) => getDueState(task) === "overdue"

      );

    }



    return result.sort((a, b) => {

      if (a.status === "Completed" && b.status !== "Completed") {

        return 1;

      }



      if (a.status !== "Completed" && b.status === "Completed") {

        return -1;

      }



      if (!a.dueDate && b.dueDate) return 1;

      if (a.dueDate && !b.dueDate) return -1;



      return String(a.dueDate || "").localeCompare(

        String(b.dueDate || "")

      );

    });

  }, [tasks, filter]);



  function updateTaskDate(id, value) {

    setTasks((current) =>

      current.map((task) =>

        task.id === id

          ? {

              ...task,

              dueDate: value,

              status:

                task.status === "Completed"

                  ? "Completed"

                  : value

                  ? "Scheduled"

                  : "Recommended",

            }

          : task

      )

    );

  }



  function completeTask(id) {

    setTasks((current) =>

      current.map((task) =>

        task.id === id

          ? {

              ...task,

              status: "Completed",

            }

          : task

      )

    );

  }



  function reopenTask(id) {

    setTasks((current) =>

      current.map((task) =>

        task.id === id

          ? {

              ...task,

              status: task.dueDate

                ? "Scheduled"

                : "Recommended",

            }

          : task

      )

    );

  }



  function deleteTask(id) {

    setTasks((current) =>

      current.filter((task) => task.id !== id)

    );

  }



  function addTask(event) {

    event.preventDefault();



    if (!newTask.title.trim()) {

      return;

    }



    const task = {

      id: Date.now(),

      title: newTask.title.trim(),

      category: newTask.category,

      priority: newTask.priority,

      frequency: newTask.frequency,

      dueDate: newTask.dueDate,

      status: newTask.dueDate

        ? "Scheduled"

        : "Recommended",

      description:

        newTask.description.trim() ||

        "Custom maintenance task added to your SolarIQ+ maintenance plan.",

    };



    setTasks((current) => [...current, task]);



    setNewTask({

      title: "",

      category: "Panels",

      priority: "Medium",

      frequency: "Monthly",

      dueDate: "",

      description: "",

    });



    setShowAddForm(false);
    setAiPrefillNotice("");
  }

  function resetPlanner() {

    setTasks(INITIAL_TASKS);

    setFilter("All");

    setShowAddForm(false);
    setAiPrefillNotice("");

  }



  return (

    <div className="min-h-full bg-slate-50 pb-10">

      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">



        {/* HEADER */}

        <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">

          <div>

            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-emerald-700">

              <CalendarDays className="h-4 w-4" />

              Preventive Maintenance

            </div>



            <h1 className="mt-1 text-3xl font-extrabold tracking-tight text-slate-950">

              Maintenance Planner

            </h1>



            <p className="mt-1 max-w-2xl text-sm leading-6 text-slate-500">

              Plan, schedule and track preventive maintenance activities

              for your solar system.

            </p>

          </div>



          <div className="flex flex-wrap gap-2">

            <button

              type="button"

              onClick={resetPlanner}

              className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-700 transition hover:bg-slate-50"

            >

              <RotateCcw className="h-4 w-4" />

              Reset

            </button>



            <button

              type="button"

              onClick={() => setShowAddForm(true)}

              className="inline-flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:bg-emerald-700"

            >

              <Plus className="h-4 w-4" />

              Add Maintenance

            </button>

          </div>

        </div>



        {/* HEALTH / INFO BANNER */}

        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-emerald-100 bg-emerald-50 p-4">

          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />



          <div>

            <div className="text-sm font-extrabold text-emerald-900">

              Preventive maintenance plan

            </div>



            <p className="mt-1 text-xs leading-5 text-emerald-800">

              Keep important solar maintenance activities organized and

              schedule them before they become system problems.

            </p>

          </div>

        </div>



        {/* STATISTICS */}

        <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">

          <StatCard

            icon={Wrench}

            label="Total Tasks"

            value={statistics.total}

            description="Maintenance activities in your current plan."

            iconClass="bg-emerald-50 text-emerald-600"

          />



          <StatCard

            icon={CalendarDays}

            label="Scheduled"

            value={statistics.scheduled}

            description="Tasks that currently have a planned date."

            iconClass="bg-blue-50 text-blue-600"

          />



          <StatCard

            icon={Clock3}

            label="Pending"

            value={

              statistics.total -

              statistics.completed

            }

            description="Tasks that still need attention."

            iconClass="bg-amber-50 text-amber-600"

          />



          <StatCard

            icon={CheckCircle2}

            label="Completed"

            value={statistics.completed}

            description="Maintenance activities already completed."

            iconClass="bg-emerald-50 text-emerald-600"

          />

        </div>



        {/* OVERDUE ALERT */}

        {statistics.overdue > 0 && (

          <div className="mb-6 flex items-center gap-3 rounded-2xl border border-red-200 bg-red-50 p-4">

            <AlertTriangle className="h-5 w-5 shrink-0 text-red-600" />



            <div className="flex-1">

              <div className="text-sm font-extrabold text-red-900">

                {statistics.overdue} maintenance task

                {statistics.overdue > 1 ? "s are" : " is"} overdue

              </div>



              <p className="mt-0.5 text-xs text-red-700">

                Review the overdue activities and reschedule or complete

                them as appropriate.

              </p>

            </div>

          </div>

        )}



        {aiPrefillNotice && (
          <div className="mb-6 flex items-start gap-3 rounded-2xl border border-blue-200 bg-blue-50 p-4">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
            <div className="flex-1">
              <div className="text-sm font-extrabold text-blue-900">
                AI maintenance recommendation
              </div>
              <p className="mt-1 text-xs leading-5 text-blue-800">
                {aiPrefillNotice}. Select a suitable date and add it to your maintenance schedule.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setAiPrefillNotice("")}
              className="text-xs font-bold text-blue-600 hover:text-blue-800"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* ADD FORM */}

        {showAddForm && (

          <form

            onSubmit={addTask}

            className="mb-6 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"

          >

            <div className="mb-5">

              <div className="text-lg font-extrabold text-slate-950">

                Add Maintenance Task

              </div>



              <p className="mt-1 text-xs text-slate-500">

                Create a custom activity and optionally schedule it.

              </p>

            </div>



            <div className="grid gap-4 md:grid-cols-2">

              <div>

                <label className="mb-1.5 block text-xs font-bold text-slate-600">

                  Task name

                </label>



                <input

                  value={newTask.title}

                  onChange={(event) =>

                    setNewTask({

                      ...newTask,

                      title: event.target.value,

                    })

                  }

                  placeholder="e.g. Check panel mounting"

                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:bg-white focus:ring-2 focus:ring-emerald-100"

                />

              </div>



              <div>

                <label className="mb-1.5 block text-xs font-bold text-slate-600">

                  Category

                </label>



                <select

                  value={newTask.category}

                  onChange={(event) =>

                    setNewTask({

                      ...newTask,

                      category: event.target.value,

                    })

                  }

                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"

                >

                  <option>Panels</option>

                  <option>Inverter</option>

                  <option>Performance</option>

                  <option>Electrical</option>

                  <option>Cleaning</option>

                  <option>Inspection</option>

                  <option>Other</option>

                </select>

              </div>



              <div>

                <label className="mb-1.5 block text-xs font-bold text-slate-600">

                  Priority

                </label>



                <select

                  value={newTask.priority}

                  onChange={(event) =>

                    setNewTask({

                      ...newTask,

                      priority: event.target.value,

                    })

                  }

                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"

                >

                  <option>High</option>

                  <option>Medium</option>

                  <option>Low</option>

                </select>

              </div>



              <div>

                <label className="mb-1.5 block text-xs font-bold text-slate-600">

                  Frequency

                </label>



                <select

                  value={newTask.frequency}

                  onChange={(event) =>

                    setNewTask({

                      ...newTask,

                      frequency: event.target.value,

                    })

                  }

                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"

                >

                  <option>Weekly</option>

                  <option>Monthly</option>

                  <option>Quarterly</option>

                  <option>Yearly</option>

                  <option>One-time</option>

                </select>

              </div>



              <div>

                <label className="mb-1.5 block text-xs font-bold text-slate-600">

                  Due date

                </label>



                <input

                  type="date"

                  min={today}

                  value={newTask.dueDate}

                  onChange={(event) =>

                    setNewTask({

                      ...newTask,

                      dueDate: event.target.value,

                    })

                  }

                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400"

                />

              </div>



              <div>

                <label className="mb-1.5 block text-xs font-bold text-slate-600">

                  Description

                </label>



                <input

                  value={newTask.description}

                  onChange={(event) =>

                    setNewTask({

                      ...newTask,

                      description: event.target.value,

                    })

                  }

                  placeholder="Short maintenance instruction"

                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-emerald-400 focus:bg-white"

                />

              </div>

            </div>



            <div className="mt-5 flex justify-end gap-2">

              <button

                type="button"

                onClick={() => setShowAddForm(false)}

                className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-50"

              >

                Cancel

              </button>



              <button

                type="submit"

                className="rounded-xl bg-emerald-600 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-700"

              >

                Add Task

              </button>

            </div>

          </form>

        )}



        {/* FILTER BAR */}

        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:flex-row sm:items-center sm:justify-between">

          <div>

            <div className="text-sm font-extrabold text-slate-900">

              Maintenance Schedule

            </div>



            <div className="text-xs text-slate-400">

              Manage your preventive maintenance activities.

            </div>

          </div>



          <div className="relative">

            <select

              value={filter}

              onChange={(event) =>

                setFilter(event.target.value)

              }

              className="appearance-none rounded-xl border border-slate-200 bg-slate-50 py-2.5 pl-3 pr-9 text-xs font-bold text-slate-600 outline-none focus:border-emerald-400"

            >

              <option>All</option>

              <option>Pending</option>

              <option>Scheduled</option>

              <option>Completed</option>

              <option>Overdue</option>

            </select>



            <ChevronDown className="pointer-events-none absolute right-3 top-3 h-4 w-4 text-slate-400" />

          </div>

        </div>



        {/* TASKS */}

        <div className="space-y-3">

          {filteredTasks.length === 0 ? (

            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">

              <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />



              <div className="mt-3 font-extrabold text-slate-900">

                No tasks found

              </div>



              <p className="mt-1 text-xs text-slate-500">

                Try another filter or add a new maintenance task.

              </p>

            </div>

          ) : (

            filteredTasks.map((task) => {

              const completed =

                task.status === "Completed";



              return (

                <div

                  key={task.id}

                  className={`rounded-2xl border bg-white p-5 shadow-sm transition ${

                    completed

                      ? "border-emerald-100 opacity-80"

                      : "border-slate-200 hover:border-emerald-200"

                  }`}

                >

                  <div className="flex flex-col gap-4 lg:flex-row lg:items-center">



                    {/* ICON */}

                    <div

                      className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${

                        completed

                          ? "bg-emerald-50 text-emerald-600"

                          : "bg-slate-100 text-slate-600"

                      }`}

                    >

                      {completed ? (

                        <CheckCircle2 className="h-5 w-5" />

                      ) : (

                        <Wrench className="h-5 w-5" />

                      )}

                    </div>



                    {/* MAIN */}

                    <div className="min-w-0 flex-1">

                      <div className="flex flex-wrap items-center gap-2">

                        <h3

                          className={`text-sm font-extrabold ${

                            completed

                              ? "text-slate-500 line-through"

                              : "text-slate-900"

                          }`}

                        >

                          {task.title}

                        </h3>



                        <StatusBadge task={task} />

                        <PriorityBadge priority={task.priority} />

                      </div>



                      <p className="mt-1.5 max-w-3xl text-xs leading-5 text-slate-500">

                        {task.description}

                      </p>



                      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-[11px] text-slate-400">

                        <span>

                          Category:{" "}

                          <strong className="text-slate-600">

                            {task.category}

                          </strong>

                        </span>



                        <span>

                          Frequency:{" "}

                          <strong className="text-slate-600">

                            {task.frequency}

                          </strong>

                        </span>



                        <span>

                          Due:{" "}

                          <strong className="text-slate-600">

                            {formatDate(task.dueDate)}

                          </strong>

                        </span>

                      </div>

                    </div>



                    {/* ACTIONS */}

                    <div className="flex flex-wrap items-center gap-2 lg:justify-end">



                      {!completed && (

                        <div className="relative">

                          <CalendarDays className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />



                          <input

                            type="date"

                            value={task.dueDate}

                            onChange={(event) =>

                              updateTaskDate(

                                task.id,

                                event.target.value

                              )

                            }

                            className="rounded-xl border border-slate-200 bg-slate-50 py-2 pl-9 pr-2 text-xs font-semibold text-slate-600 outline-none focus:border-emerald-400"

                          />

                        </div>

                      )}



                      {completed ? (

                        <button

                          type="button"

                          onClick={() =>

                            reopenTask(task.id)

                          }

                          className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-600 hover:bg-slate-50"

                        >

                          Reopen

                        </button>

                      ) : (

                        <button

                          type="button"

                          onClick={() =>

                            completeTask(task.id)

                          }

                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white hover:bg-emerald-700"

                        >

                          <CheckCircle2 className="h-3.5 w-3.5" />

                          Complete

                        </button>

                      )}



                      <button

                        type="button"

                        onClick={() =>

                          deleteTask(task.id)

                        }

                        className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"

                        title="Delete task"

                      >

                        <Trash2 className="h-4 w-4" />

                      </button>

                    </div>

                  </div>

                </div>

              );

            })

          )}

        </div>



        {/* FOOTER NOTE */}

        <div className="mt-6 rounded-2xl border border-slate-200 bg-white p-4">

          <div className="flex items-start gap-3">

            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />



            <div>

              <div className="text-xs font-extrabold text-slate-800">

                Maintenance safety reminder

              </div>



              <p className="mt-1 text-[11px] leading-5 text-slate-500">

                Basic visual checks can be performed by the system owner

                when safe. Electrical repairs, rooftop work and equipment

                servicing should be handled by a qualified professional.

              </p>

            </div>

          </div>

        </div>

      </div>

    </div>

  );

}