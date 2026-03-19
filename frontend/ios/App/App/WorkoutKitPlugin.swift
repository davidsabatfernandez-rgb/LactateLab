import Foundation
import Capacitor

@available(iOS 17.0, *)
import WorkoutKit

/// Capacitor plugin that bridges JavaScript to Apple WorkoutKit.
/// Converts JSON workout definitions to CustomWorkout and syncs to Apple Watch.
@objc(WorkoutKitPlugin)
public class WorkoutKitPlugin: CAPPlugin, CAPBridgedPlugin {
    public let identifier = "WorkoutKitPlugin"
    public let jsName = "WorkoutKit"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "isSupported", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "previewWorkout", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "syncWorkout", returnType: CAPPluginReturnPromise),
    ]

    // MARK: - isSupported

    @objc func isSupported(_ call: CAPPluginCall) {
        if #available(iOS 17.0, *) {
            call.resolve(["supported": true])
        } else {
            call.resolve(["supported": false])
        }
    }

    // MARK: - previewWorkout (shows system preview sheet)

    @objc func previewWorkout(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *) else {
            call.reject("WorkoutKit requires iOS 17+")
            return
        }

        guard let workoutData = call.getObject("workout") else {
            call.reject("Missing 'workout' parameter")
            return
        }

        do {
            let workout = try buildCustomWorkout(from: workoutData)
            Task { @MainActor in
                do {
                    try await workout.presentPreview()
                    call.resolve(["success": true])
                } catch {
                    call.reject("Preview failed: \(error.localizedDescription)")
                }
            }
        } catch {
            call.reject("Failed to build workout: \(error.localizedDescription)")
        }
    }

    // MARK: - syncWorkout (saves to WorkoutPlanStore — appears on Watch)

    @objc func syncWorkout(_ call: CAPPluginCall) {
        guard #available(iOS 17.0, *) else {
            call.reject("WorkoutKit requires iOS 17+")
            return
        }

        guard let workoutData = call.getObject("workout") else {
            call.reject("Missing 'workout' parameter")
            return
        }

        do {
            let workout = try buildCustomWorkout(from: workoutData)
            Task {
                do {
                    let composition = WorkoutComposition(.custom(workout))
                    try await WorkoutStore.shared.save(composition)
                    call.resolve(["success": true])
                } catch {
                    // Fallback: try presentPreview if store fails
                    await MainActor.run {
                        Task {
                            do {
                                try await workout.presentPreview()
                                call.resolve(["success": true, "method": "preview"])
                            } catch {
                                call.reject("Sync failed: \(error.localizedDescription)")
                            }
                        }
                    }
                }
            }
        } catch {
            call.reject("Failed to build workout: \(error.localizedDescription)")
        }
    }

    // MARK: - Build CustomWorkout from JSON

    @available(iOS 17.0, *)
    private func buildCustomWorkout(from data: [String: Any]) throws -> CustomWorkout {
        let title = data["title"] as? String ?? "Workout"
        let sport = data["sport"] as? String ?? "running"

        // Activity type
        let activityType: HKWorkoutActivityType
        switch sport.lowercased() {
        case "running":    activityType = .running
        case "ciclismo":   activityType = .cycling
        case "natación":   activityType = .swimming
        default:           activityType = .running
        }

        let location: HKWorkoutSessionLocationType = (data["indoor"] as? Bool == true) ? .indoor : .outdoor
        let activity = WorkoutActivity(workoutType: activityType, location: location)

        // Target mode: pace | hr | power
        let targetMode = data["targetMode"] as? String ?? "pace"

        // Warmup
        var warmupStep: WorkoutStep? = nil
        if let warmup = data["warmup"] as? [String: Any] {
            warmupStep = buildStep(from: warmup, targetMode: targetMode)
        }

        // Cooldown
        var cooldownStep: WorkoutStep? = nil
        if let cooldown = data["cooldown"] as? [String: Any] {
            cooldownStep = buildStep(from: cooldown, targetMode: targetMode)
        }

        // Blocks (intervals)
        var intervalBlocks: [IntervalBlock] = []
        if let blocks = data["blocks"] as? [[String: Any]] {
            for blockData in blocks {
                if let block = buildIntervalBlock(from: blockData, targetMode: targetMode) {
                    intervalBlocks.append(block)
                }
            }
        }

        return CustomWorkout(
            activity: activity,
            displayName: title,
            warmup: warmupStep,
            blocks: intervalBlocks,
            cooldown: cooldownStep
        )
    }

    @available(iOS 17.0, *)
    private func buildStep(from data: [String: Any], targetMode: String) -> WorkoutStep {
        let goal = buildGoal(from: data)
        let alert = buildAlert(from: data, targetMode: targetMode)
        if let alert = alert {
            return WorkoutStep(goal: goal, alert: alert)
        }
        return WorkoutStep(goal: goal)
    }

    @available(iOS 17.0, *)
    private func buildGoal(from data: [String: Any]) -> WorkoutGoal {
        let goalType = data["goalType"] as? String ?? "time"
        let goalValue = data["goalValue"] as? Double ?? 0

        switch goalType {
        case "time":
            return .time(goalValue) // seconds
        case "distance":
            return .distance(goalValue, .meters)
        default:
            return .open
        }
    }

    @available(iOS 17.0, *)
    private func buildAlert(from data: [String: Any], targetMode: String) -> WorkoutAlert? {
        // Check for explicit target in the step
        guard let target = data["target"] as? [String: Any] else { return nil }
        let mode = target["type"] as? String ?? targetMode

        switch mode {
        case "pace":
            // Pace values in seconds per km (e.g., 300 = 5:00/km)
            guard let low = target["low"] as? Double,
                  let high = target["high"] as? Double else { return nil }
            // Convert s/km to m/s: m/s = 1000 / (s/km)
            // Note: faster pace = higher m/s = lower s/km
            let fastMps = 1000.0 / low   // low s/km = fast
            let slowMps = 1000.0 / high  // high s/km = slow
            return .speed(target: .range(
                lowerBound: Measurement(value: slowMps, unit: .metersPerSecond),
                upperBound: Measurement(value: fastMps, unit: .metersPerSecond)
            ))
        case "hr":
            guard let low = target["low"] as? Double,
                  let high = target["high"] as? Double else { return nil }
            return .heartRate(target: .range(
                lowerBound: low,
                upperBound: high
            ))
        case "power":
            guard let low = target["low"] as? Double,
                  let high = target["high"] as? Double else { return nil }
            return .power(target: .range(
                lowerBound: Measurement(value: low, unit: .watts),
                upperBound: Measurement(value: high, unit: .watts)
            ))
        default:
            return nil
        }
    }

    @available(iOS 17.0, *)
    private func buildIntervalBlock(from data: [String: Any], targetMode: String) -> IntervalBlock? {
        let iterations = data["iterations"] as? Int ?? 1
        var steps: [IntervalStep] = []

        if let stepsData = data["steps"] as? [[String: Any]] {
            for stepData in stepsData {
                let purpose = (stepData["purpose"] as? String ?? "work") == "recovery"
                    ? IntervalStep.Purpose.recovery
                    : IntervalStep.Purpose.work
                let workoutStep = buildStep(from: stepData, targetMode: targetMode)
                steps.append(IntervalStep(purpose, step: workoutStep))
            }
        }

        guard !steps.isEmpty else { return nil }
        return IntervalBlock(steps: steps, iterations: iterations)
    }
}
