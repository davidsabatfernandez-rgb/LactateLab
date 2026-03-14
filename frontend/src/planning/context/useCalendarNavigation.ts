import { useCallback, useEffect, useRef } from "react";
import type { Dispatch } from "react";

import { addDays, addMonths, isoDateFromToday, startOfMonth, startOfWeek } from "../utils";
import type { PlanningAction } from "./PlanningContext";

export type CalendarNavigationRefs = {
  calendarWeekScrollerRef: React.MutableRefObject<HTMLDivElement | null>;
  calendarWeekScrollFrameRef: React.MutableRefObject<number | null>;
  calendarWeekAutoCenteredRef: React.MutableRefObject<boolean>;
  calendarWeekSectionRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
  calendarMonthScrollerRef: React.MutableRefObject<HTMLDivElement | null>;
  calendarMonthScrollFrameRef: React.MutableRefObject<number | null>;
  calendarMonthAutoCenteredRef: React.MutableRefObject<boolean>;
  calendarMonthSectionRefs: React.MutableRefObject<Record<string, HTMLElement | null>>;
};

export function useCalendarNavigation(
  dispatch: Dispatch<PlanningAction>,
  calendarMonth: string,
  calendarVisualMode: "month" | "week",
  selectedWeekStart: string,
  selectedWeekdayOffset: number,
  continuousWeekStarts: string[],
  continuousMonthStarts: string[],
): CalendarNavigationRefs & {
  jumpCalendarToToday: () => void;
  shiftCalendarBackward: () => void;
  shiftCalendarForward: () => void;
  handleContinuousWeekScroll: () => void;
  handleContinuousMonthScroll: () => void;
  scrollCalendarWeekIntoView: (weekStart: string, behavior?: ScrollBehavior) => void;
  scrollCalendarMonthIntoView: (monthStart: string, behavior?: ScrollBehavior) => void;
} {
  const calendarWeekScrollerRef = useRef<HTMLDivElement | null>(null);
  const calendarWeekScrollFrameRef = useRef<number | null>(null);
  const calendarWeekAutoCenteredRef = useRef(false);
  const calendarWeekSectionRefs = useRef<Record<string, HTMLElement | null>>({});
  const calendarMonthScrollerRef = useRef<HTMLDivElement | null>(null);
  const calendarMonthScrollFrameRef = useRef<number | null>(null);
  const calendarMonthAutoCenteredRef = useRef(false);
  const calendarMonthSectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const scrollCalendarWeekIntoView = useCallback((weekStart: string, behavior: ScrollBehavior = "smooth") => {
    const scroller = calendarWeekScrollerRef.current;
    const section = calendarWeekSectionRefs.current[weekStart];
    if (!scroller || !section) return;
    const targetTop = Math.max(0, section.offsetTop - scroller.clientHeight * 0.18);
    scroller.scrollTo({ top: targetTop, behavior });
  }, []);

  const scrollCalendarMonthIntoView = useCallback((monthStart: string, behavior: ScrollBehavior = "smooth") => {
    const scroller = calendarMonthScrollerRef.current;
    const section = calendarMonthSectionRefs.current[monthStart];
    if (!scroller || !section) return;
    const targetTop = Math.max(0, section.offsetTop - scroller.clientHeight * 0.08);
    scroller.scrollTo({ top: targetTop, behavior });
  }, []);

  const jumpCalendarToToday = useCallback(() => {
    const today = isoDateFromToday();
    dispatch({ type: "SET_CALENDAR_MONTH", payload: startOfMonth(today) });
    dispatch({ type: "SET_SELECTED_CALENDAR_DATE", payload: today });
  }, [dispatch]);

  const shiftCalendarBackward = useCallback(() => {
    if (calendarVisualMode === "week") {
      const nextDate = addDays(selectedWeekStart, -7);
      dispatch({ type: "SET_SELECTED_CALENDAR_DATE", payload: nextDate });
      dispatch({ type: "SET_CALENDAR_MONTH", payload: startOfMonth(nextDate) });
      return;
    }
    const targetMonth = startOfMonth(addMonths(calendarMonth, -1));
    dispatch({ type: "SET_CALENDAR_MONTH", payload: targetMonth });
  }, [calendarMonth, calendarVisualMode, selectedWeekStart, dispatch]);

  const shiftCalendarForward = useCallback(() => {
    if (calendarVisualMode === "week") {
      const nextDate = addDays(selectedWeekStart, 7);
      dispatch({ type: "SET_SELECTED_CALENDAR_DATE", payload: nextDate });
      dispatch({ type: "SET_CALENDAR_MONTH", payload: startOfMonth(nextDate) });
      return;
    }
    const targetMonth = startOfMonth(addMonths(calendarMonth, 1));
    dispatch({ type: "SET_CALENDAR_MONTH", payload: targetMonth });
  }, [calendarMonth, calendarVisualMode, selectedWeekStart, dispatch]);

  const syncCalendarWeekSelectionFromScroll = useCallback(() => {
    const scroller = calendarWeekScrollerRef.current;
    if (!scroller) return;

    const viewportFocus = scroller.scrollTop + scroller.clientHeight * 0.32;
    let closestWeekStart = selectedWeekStart;
    let closestDistance = Number.POSITIVE_INFINITY;

    continuousWeekStarts.forEach((weekStart) => {
      const section = calendarWeekSectionRefs.current[weekStart];
      if (!section) return;
      const distance = Math.abs(section.offsetTop - viewportFocus);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestWeekStart = weekStart;
      }
    });

    if (closestWeekStart === selectedWeekStart) return;

    const nextDate = addDays(closestWeekStart, selectedWeekdayOffset);
    dispatch({ type: "SET_SELECTED_CALENDAR_DATE", payload: nextDate });
    dispatch({ type: "SET_CALENDAR_MONTH", payload: startOfMonth(nextDate) });
  }, [continuousWeekStarts, selectedWeekStart, selectedWeekdayOffset, dispatch]);

  const handleContinuousWeekScroll = useCallback(() => {
    if (calendarWeekScrollFrameRef.current != null) return;
    calendarWeekScrollFrameRef.current = window.requestAnimationFrame(() => {
      calendarWeekScrollFrameRef.current = null;
      syncCalendarWeekSelectionFromScroll();
    });
  }, [syncCalendarWeekSelectionFromScroll]);

  const syncCalendarMonthSelectionFromScroll = useCallback(() => {
    const scroller = calendarMonthScrollerRef.current;
    if (!scroller) return;

    const viewportFocus = scroller.scrollTop + scroller.clientHeight * 0.2;
    let closestMonth = calendarMonth;
    let closestDistance = Number.POSITIVE_INFINITY;

    continuousMonthStarts.forEach((monthStart) => {
      const section = calendarMonthSectionRefs.current[monthStart];
      if (!section) return;
      const distance = Math.abs(section.offsetTop - viewportFocus);
      if (distance < closestDistance) {
        closestDistance = distance;
        closestMonth = monthStart;
      }
    });

    if (closestMonth !== calendarMonth) {
      dispatch({ type: "SET_CALENDAR_MONTH", payload: closestMonth });
    }
  }, [calendarMonth, continuousMonthStarts, dispatch]);

  const handleContinuousMonthScroll = useCallback(() => {
    if (calendarMonthScrollFrameRef.current != null) return;
    calendarMonthScrollFrameRef.current = window.requestAnimationFrame(() => {
      calendarMonthScrollFrameRef.current = null;
      syncCalendarMonthSelectionFromScroll();
    });
  }, [syncCalendarMonthSelectionFromScroll]);

  // Cleanup animation frames
  useEffect(() => () => {
    if (calendarWeekScrollFrameRef.current != null) {
      window.cancelAnimationFrame(calendarWeekScrollFrameRef.current);
    }
  }, []);

  useEffect(() => () => {
    if (calendarMonthScrollFrameRef.current != null) {
      window.cancelAnimationFrame(calendarMonthScrollFrameRef.current);
    }
  }, []);

  // Auto-center week view
  useEffect(() => {
    if (calendarVisualMode !== "week") {
      calendarWeekAutoCenteredRef.current = false;
      return;
    }

    const scroller = calendarWeekScrollerRef.current;
    const selectedSection = calendarWeekSectionRefs.current[selectedWeekStart];
    if (!scroller || !selectedSection) return;

    const targetTop = Math.max(0, selectedSection.offsetTop - scroller.clientHeight * 0.18);
    const alreadyNearTarget = Math.abs(scroller.scrollTop - targetTop) < 36;

    if (!calendarWeekAutoCenteredRef.current) {
      scroller.scrollTo({ top: targetTop, behavior: "auto" });
      calendarWeekAutoCenteredRef.current = true;
      return;
    }

    if (!alreadyNearTarget) {
      scroller.scrollTo({ top: targetTop, behavior: "smooth" });
    }
  }, [calendarVisualMode, continuousWeekStarts, selectedWeekStart]);

  // Auto-center month view
  useEffect(() => {
    if (calendarVisualMode !== "month") {
      calendarMonthAutoCenteredRef.current = false;
      return;
    }

    const scroller = calendarMonthScrollerRef.current;
    const selectedSection = calendarMonthSectionRefs.current[calendarMonth];
    if (!scroller || !selectedSection) return;

    const targetTop = Math.max(0, selectedSection.offsetTop - scroller.clientHeight * 0.08);
    const alreadyNearTarget = Math.abs(scroller.scrollTop - targetTop) < 40;

    if (!calendarMonthAutoCenteredRef.current) {
      scroller.scrollTo({ top: targetTop, behavior: "auto" });
      calendarMonthAutoCenteredRef.current = true;
      return;
    }

    if (!alreadyNearTarget) {
      scroller.scrollTo({ top: targetTop, behavior: "smooth" });
    }
  }, [calendarMonth, calendarVisualMode, continuousMonthStarts]);

  return {
    calendarWeekScrollerRef,
    calendarWeekScrollFrameRef,
    calendarWeekAutoCenteredRef,
    calendarWeekSectionRefs,
    calendarMonthScrollerRef,
    calendarMonthScrollFrameRef,
    calendarMonthAutoCenteredRef,
    calendarMonthSectionRefs,
    jumpCalendarToToday,
    shiftCalendarBackward,
    shiftCalendarForward,
    handleContinuousWeekScroll,
    handleContinuousMonthScroll,
    scrollCalendarWeekIntoView,
    scrollCalendarMonthIntoView,
  };
}
