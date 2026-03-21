import { useState } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight, Clock, Download, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import CircularTimeline from "@/components/CircularTimeline";

const DailyOverview = () => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [timeRange, setTimeRange] = useState<"24h" | "12h">("24h");

  const dayName = currentDate.toLocaleDateString("en-US", { weekday: "long" }).toUpperCase();
  const formattedDate = currentDate.toLocaleDateString("en-US", { 
    month: "short", 
    day: "numeric",
    year: "numeric"
  });

  const navigateDay = (direction: number) => {
    const newDate = new Date(currentDate);
    newDate.setDate(newDate.getDate() + direction);
    setCurrentDate(newDate);
  };

  // Sample schedule data
  const scheduleBlocks = [
    { id: 1, label: "Deep Focus", startHour: 6, duration: 3, color: "timeline-teal" },
    { id: 2, label: "Team Sync", startHour: 9, duration: 1, color: "timeline-amber" },
    { id: 3, label: "Building", startHour: 10, duration: 2.5, color: "timeline-blue" },
    { id: 4, label: "Lunch", startHour: 12.5, duration: 1, color: "timeline-muted" },
    { id: 5, label: "Creative", startHour: 13.5, duration: 1.75, color: "timeline-rose" },
    { id: 6, label: "Focus", startHour: 15.25, duration: 2.25, color: "timeline-teal" },
    { id: 7, label: "Review", startHour: 17.5, duration: 1, color: "timeline-purple" },
    { id: 8, label: "Planning", startHour: 19, duration: 0.5, color: "timeline-amber" },
  ];

  const stats = {
    focus: { hours: 5, minutes: 15 },
    creative: { hours: 1, minutes: 45 },
    meetings: { hours: 1, minutes: 0 },
    building: { hours: 2, minutes: 30 },
  };

  const totalHours = Object.values(stats).reduce((acc, s) => acc + s.hours + s.minutes / 60, 0);

  return (
    <div className="dark min-h-screen bg-[hsl(240_10%_4%)] text-[hsl(0_0%_95%)] flex flex-col safe-area-top-ios">
      {/* Subtle gradient overlay */}
      <div className="fixed inset-0 bg-gradient-to-b from-[hsl(240_15%_8%)] via-transparent to-[hsl(240_10%_3%)] pointer-events-none" />
      
      {/* Navigation Bar */}
      <motion.header 
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="relative z-10 flex items-center justify-between px-6 py-4 border-b border-[hsl(240_10%_15%)]"
      >
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[hsl(240_5%_50%)] hover:text-[hsl(0_0%_95%)] hover:bg-[hsl(240_10%_12%)]"
            onClick={() => setTimeRange(timeRange === "24h" ? "12h" : "24h")}
          >
            <Clock className="h-4 w-4" />
          </Button>
          <span className="text-xs font-medium text-[hsl(240_5%_50%)] tracking-wider">
            {timeRange}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[hsl(240_5%_50%)] hover:text-[hsl(0_0%_95%)] hover:bg-[hsl(240_10%_12%)]"
            onClick={() => navigateDay(-1)}
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="text-sm font-medium text-[hsl(0_0%_85%)] min-w-[120px] text-center">
            {formattedDate}
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-[hsl(240_5%_50%)] hover:text-[hsl(0_0%_95%)] hover:bg-[hsl(240_10%_12%)]"
            onClick={() => navigateDay(1)}
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>

        <div className="w-16" /> {/* Spacer for balance */}
      </motion.header>

      {/* Main Content */}
      <main className="relative z-10 flex-1 flex flex-col items-center justify-center px-6 py-8">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="relative w-full max-w-[400px] aspect-square"
        >
          {/* Circular Timeline */}
          <CircularTimeline blocks={scheduleBlocks} timeRange={timeRange} />

          {/* Center Content */}
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              className="text-center"
            >
              <h1 className="text-2xl font-semibold tracking-[0.2em] text-[hsl(0_0%_95%)] mb-1">
                {dayName}
              </h1>
              <p className="text-sm text-[hsl(240_5%_50%)] mb-6">
                {totalHours.toFixed(1)}h scheduled
              </p>

              {/* Stats */}
              <div className="grid grid-cols-2 gap-x-6 gap-y-3 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[hsl(175_60%_45%)]" />
                  <span className="text-[hsl(240_5%_55%)] uppercase tracking-wider">Focus</span>
                  <span className="text-[hsl(0_0%_85%)] font-medium ml-auto">
                    {stats.focus.hours}h {stats.focus.minutes}m
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[hsl(350_65%_55%)]" />
                  <span className="text-[hsl(240_5%_55%)] uppercase tracking-wider">Creative</span>
                  <span className="text-[hsl(0_0%_85%)] font-medium ml-auto">
                    {stats.creative.hours}h {stats.creative.minutes}m
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[hsl(40_70%_50%)]" />
                  <span className="text-[hsl(240_5%_55%)] uppercase tracking-wider">Meetings</span>
                  <span className="text-[hsl(0_0%_85%)] font-medium ml-auto">
                    {stats.meetings.hours}h {stats.meetings.minutes}m
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-[hsl(215_70%_55%)]" />
                  <span className="text-[hsl(240_5%_55%)] uppercase tracking-wider">Building</span>
                  <span className="text-[hsl(0_0%_85%)] font-medium ml-auto">
                    {stats.building.hours}h {stats.building.minutes}m
                  </span>
                </div>
              </div>
            </motion.div>
          </div>
        </motion.div>
      </main>

      {/* Bottom Actions */}
      <motion.footer
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4, delay: 0.4 }}
        className="relative z-10 flex items-center justify-center gap-4 px-6 py-6 safe-area-bottom"
      >
        <Button
          className="h-12 px-8 rounded-full bg-[hsl(0_0%_95%)] text-[hsl(240_10%_8%)] hover:bg-[hsl(0_0%_85%)] font-medium shadow-lg shadow-[hsl(0_0%_0%_/_0.3)] transition-all duration-200"
        >
          <Plus className="h-4 w-4 mr-2" />
          New Task
        </Button>
        <Button
          variant="outline"
          className="h-12 px-8 rounded-full border-[hsl(240_10%_20%)] bg-[hsl(240_10%_10%)] text-[hsl(0_0%_75%)] hover:bg-[hsl(240_10%_15%)] hover:text-[hsl(0_0%_95%)] font-medium transition-all duration-200"
        >
          <Download className="h-4 w-4 mr-2" />
          Export
        </Button>
      </motion.footer>
    </div>
  );
};

export default DailyOverview;
