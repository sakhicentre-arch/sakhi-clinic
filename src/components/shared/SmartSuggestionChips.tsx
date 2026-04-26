import React from "react";
import { Sparkles, Zap } from "lucide-react";

interface PrescriptionSuggestion {
  remedy: string;
  potency: string;
  reasoning: string;
  confidence: "high" | "medium" | "low";
}

interface SmartSuggestionChipsProps {
  suggestions: PrescriptionSuggestion[];
  onSelectSuggestion: (remedy: string, potency: string) => void;
}

export default function SmartSuggestionChips({ suggestions, onSelectSuggestion }: SmartSuggestionChipsProps) {
  if (suggestions.length === 0) return null;

  const getConfidenceColor = (confidence: string) => {
    switch (confidence) {
      case "high": return "#15803d";
      case "medium": return "#d97706";
      case "low": return "#6b7280";
      default: return "#6b7280";
    }
  };

  const getConfidenceBg = (confidence: string) => {
    switch (confidence) {
      case "high": return "#dcfce7";
      case "medium": return "#fef3c7";
      case "low": return "#f3f4f6";
      default: return "#f3f4f6";
    }
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        marginBottom: 12
      }}>
        <Sparkles size={16} color="#7c3aed" />
        <span style={{
          fontSize: 13,
          fontWeight: 800,
          color: "#374151",
          textTransform: "uppercase",
          letterSpacing: 1
        }}>
          Smart Suggestions
        </span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
        {suggestions.map((suggestion, index) => (
          <div
            key={index}
            style={{
              position: "relative",
              background: "#fff",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "12px 16px",
              cursor: "pointer",
              transition: "all 0.15s ease",
              minWidth: 200,
              boxShadow: "0 1px 3px rgba(0,0,0,0.1)"
            }}
            onClick={() => onSelectSuggestion(suggestion.remedy, suggestion.potency)}
            onMouseEnter={(e) => {
              e.currentTarget.style.borderColor = "#7c3aed";
              e.currentTarget.style.boxShadow = "0 4px 12px rgba(124, 58, 237, 0.15)";
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = "#e2e8f0";
              e.currentTarget.style.boxShadow = "0 1px 3px rgba(0,0,0,0.1)";
            }}
          >
            <div style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              marginBottom: 6
            }}>
              <div style={{
                fontSize: 14,
                fontWeight: 700,
                color: "#0f172a"
              }}>
                {suggestion.remedy} {suggestion.potency}
              </div>
              <div style={{
                background: getConfidenceBg(suggestion.confidence),
                color: getConfidenceColor(suggestion.confidence),
                fontSize: 10,
                fontWeight: 700,
                padding: "2px 6px",
                borderRadius: 4,
                textTransform: "uppercase",
                letterSpacing: 0.5
              }}>
                {suggestion.confidence}
              </div>
            </div>
            <div style={{
              fontSize: 12,
              color: "#6b7280",
              lineHeight: 1.4
            }}>
              {suggestion.reasoning}
            </div>
            <div style={{
              position: "absolute",
              top: 8,
              right: 8,
              color: "#7c3aed",
              fontSize: 12
            }}>
              <Zap size={12} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
