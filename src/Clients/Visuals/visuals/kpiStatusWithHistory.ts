/*
 *  Power BI Visualizations
 *
 *  Copyright (c) Microsoft Corporation
 *  All rights reserved. 
 *  MIT License
 *
 *  Permission is hereby granted, free of charge, to any person obtaining a copy
 *  of this software and associated documentation files (the ""Software""), to deal
 *  in the Software without restriction, including without limitation the rights
 *  to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 *  copies of the Software, and to permit persons to whom the Software is
 *  furnished to do so, subject to the following conditions:
 *   
 *  The above copyright notice and this permission notice shall be included in 
 *  all copies or substantial portions of the Software.
 *   
 *  THE SOFTWARE IS PROVIDED *AS IS*, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR 
 *  IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 *  FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE 
 *  AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 *  LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 *  OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 *  THE SOFTWARE.
 */

/*
Created by Fredrik Hedenström, 2015-09-08
*/

/// <reference path="../_references.ts"/>

module powerbi.visuals {
    export interface KPIStatusWithHistoryDataPoint {
        x: number;
        y: number;
        w: number;
        dataId: string;
        ActualOrg: number;
        GoalOrg: number;
        selector: data.Selector;
        tooltipInfo: TooltipDataItem[];
    }

    export class KPIStatusWithHistory implements IVisual {
        public static capabilities: VisualCapabilities = {
            dataRoles: [
                {
                    name: 'Values',
                    kind: VisualDataRoleKind.Measure,
                    displayName: data.createDisplayNameGetter('Role_DisplayName_Value'),
                }, {
                    name: 'Targets',
                    kind: VisualDataRoleKind.Measure,
                    displayName: data.createDisplayNameGetter('Role_DisplayName_TargetValue'),
                }, {
                    name: 'Category',
                    kind: VisualDataRoleKind.Grouping,
                    displayName: data.createDisplayNameGetter('Role_DisplayName_Axis'),
                }],
            dataViewMappings: [{
                conditions: [
                    { 'Values': { max: 1 }, 'Targets': { max: 1 } },
                ],
                categorical: {
                    categories: {
                        for: { in: 'Category' },
                        dataReductionAlgorithm: { top: {} }
                    },
                    values: {
                        select: [
                            { bind: { to: 'Values' } },
                            { bind: { to: 'Targets' } }
                        ]
                    }
                },
            }],
            objects: {
                general: {
                    displayName: data.createDisplayNameGetter('Visual_General'),
                    properties: {
                        formatString: {
                            type: { formatting: { formatString: true } },
                        },
                        pKPIName: {
                            type: { text: true },
                            displayName: 'KPI name'
                        },
                        pBandingPercentage: {
                            type: { numeric: true },
                            displayName: 'Banding percentage'
                        },
                        pBandingType: {
                            type: { text: true },
                            displayName: 'Banding type (IIB, DIB or CIB)'
                        },
                        pBandingCompareType: {
                            type: { text: true },
                            displayName: 'Banding compare type (ABS, REL)'
                        },
                        pChartType: {
                            type: { text: true },
                            displayName: 'Chart type (LINE, BAR)'
                        }
                    },
                }
            },
        };

        private svg: D3.Selection;
        private dataView: DataView;
        private selectiionManager: utility.SelectionManager;
        public metaDataColumn: DataViewMetadataColumn;

        private sMainGroupElement: D3.Selection;
        private sMainGroupElement2: D3.Selection;
        private sMainRect: D3.Selection;
        private sKPIText: D3.Selection;
        private sKPIActualText: D3.Selection;
        private sKPIActualDiffText: D3.Selection;
        private sLinePath: D3.Selection;
        private kpiText: string;
        private kpiBandingCompareType: string;
        private kpiBandingStatusType: string;
        private kpiGoal: number;
        private kpiActual: number;
        private kpiBandingPercent: number;
        private kpiChartType: string;

        private kpiTargetExists: boolean;
        private kpiHistoryExists: boolean;

        private cardFormatSetting: CardFormatSetting;

        private getFormattedValue(dataView: DataView, theValue: number): string {
            this.getMetaDataColumn(dataView);
            this.cardFormatSetting = this.getDefaultFormatSettings();
            var metaDataColumn = this.metaDataColumn;
            var labelSettings = this.cardFormatSetting.labelSettings;
            var isDefaultDisplayUnit = labelSettings.displayUnits === 0;
            var formatter = valueFormatter.create({
                format: this.getFormatString(metaDataColumn),
                value: labelSettings.displayUnits,
                precision: labelSettings.precision,
                displayUnitSystemType: DisplayUnitSystemType.WholeUnits, // keeps this.displayUnitSystemType as the displayUnitSystemType unless the user changed the displayUnits or the precision
                formatSingleValues: isDefaultDisplayUnit ? true : false,
                allowFormatBeautification: true,
                columnType: metaDataColumn ? metaDataColumn.type : undefined
            });
            return formatter.format(theValue);
        }

        public static converter(dataView: DataView, viewPort: powerbi.IViewport, thisRef: KPIStatusWithHistory): KPIStatusWithHistoryDataPoint[] {
            var dataPoints: KPIStatusWithHistoryDataPoint[] = [];
            var sW = viewPort.width;
            var sH = viewPort.height;

            var catDv: DataViewCategorical = dataView.categorical;

            var cat, catValues;
            if (thisRef.kpiHistoryExists) {
                cat = catDv.categories[0]; // This only works if we have a category axis
                catValues = cat.values;
            }

            // TODO / Known bug: We need to find the correct index for Actuals and Targets (if the user selects the target first it is treated as actual (index=0)). For some reason the ROLES attribute is not working...

            var values = catDv.values;

            var historyActualData = [];
            var historyGoalData = [];

            thisRef.kpiTargetExists = false;
            if (values.length > 1) {
                thisRef.kpiTargetExists = true;
            }

            for (var i = 0, len = values[0].values.length; i < len; i++) {
                var actualValue = values[0].values[i];
                historyActualData.push(actualValue);
                if (thisRef.kpiTargetExists) {
                    var targetValue = values[1].values[i];
                    historyGoalData.push(targetValue);
                }
            }

            var nW = sW * 0.9;
            var nMax = Math.max.apply(Math, historyActualData);
            var nMin = Math.min.apply(Math, historyActualData);
            var nH = sH * 0.32;

            for (var i = 0; i < historyActualData.length; i++) {
                var yPos = nH * (historyActualData[i] - nMin) / (nMax - nMin);
                var toolTipString = 'Actual ' + thisRef.getFormattedValue(dataView, historyActualData[i]);
                if (thisRef.kpiTargetExists) {
                    toolTipString += " ; Target " + thisRef.getFormattedValue(dataView, historyGoalData[i]);
                }
                var toolTipStringName = "";
                var selectorId = null;
                if (thisRef.kpiHistoryExists) {
                    toolTipStringName = catValues[i];
                    selectorId = SelectionId.createWithId(cat.identity[i]).getSelector();
                }

                dataPoints.push({
                    x: (i * nW / historyActualData.length) + (nW / historyActualData.length) * 0.5 + (sW - nW) / 2,
                    y: sH - yPos - sH * 0.1 - 2,
                    h: yPos + 2,
                    w: (sW / historyActualData.length) * 0.55,
                    dataId: (i * nW / historyActualData.length) + (nW / historyActualData.length) * 0.5 + (sW - nW) / 2 + "_" + (sH - yPos - sH * 0.1 - 2), // This ID identifies the points
                    ActualOrg: historyActualData[i],
                    GoalOrg: historyGoalData[i],
                    selector: selectorId,
                    tooltipInfo: [{
                        displayName: toolTipStringName,
                        value: toolTipString,
                    }]
                });
            }
            return dataPoints;
        }

        public init(options: VisualInitOptions): void {
            this.svg = d3.select(options.element.get(0))
                .append('svg');

            this.sMainGroupElement = this.svg.append('g');
            this.sMainGroupElement2 = this.svg.append('g');
            this.sMainRect = this.sMainGroupElement.append("rect");
            this.sKPIText = this.sMainGroupElement.append("text");
            this.sKPIActualText = this.sMainGroupElement.append("text");
            this.sKPIActualDiffText = this.sMainGroupElement.append("text");
            this.sLinePath = this.sMainGroupElement.append("path");

            this.selectiionManager = new utility.SelectionManager({ hostServices: options.host });
        }

        public update(options: VisualUpdateOptions) {
            if (!options.dataViews && !options.dataViews[0]) return;
            var dataView = this.dataView = options.dataViews[0];
            var viewport = options.viewport;

            this.kpiHistoryExists = true;
            if (dataView.categorical.categories === undefined) {
                this.kpiHistoryExists = false;
            }

            // We must have at least one measure
            if (dataView.categorical === undefined || dataView.categorical.values === undefined || dataView.categorical.values.length < 1) {
                this.svg.attr("visibility", "hidden");
                return;
            }
            this.svg.attr("visibility", "visible");

            var dataPoints: KPIStatusWithHistoryDataPoint[] = KPIStatusWithHistory.converter(dataView, viewport, this);

            this.kpiText = KPIStatusWithHistory.getProp_KPIName(dataView);
            this.kpiChartType = KPIStatusWithHistory.getProp_ChartType(dataView).toUpperCase();
            this.kpiBandingPercent = KPIStatusWithHistory.getProp_BandingPercentage(dataView) / 100;
            this.kpiBandingStatusType = KPIStatusWithHistory.getProp_BandingType(dataView).toUpperCase();
            this.kpiBandingCompareType = KPIStatusWithHistory.getProp_BandingCompareType(dataView).toUpperCase();

            this.kpiGoal = dataPoints[dataPoints.length - 1].GoalOrg;
            this.kpiActual = dataPoints[dataPoints.length - 1].ActualOrg;

            this.svg.attr({
                'height': viewport.height,
                'width': viewport.width
            });

            var statusColor = "#999999";
            if (this.kpiTargetExists) {
                statusColor = GetStatusColor(this.kpiActual, this.kpiGoal, this.kpiBandingStatusType, this.kpiBandingCompareType, this.kpiBandingPercent);
            }

            var sW = viewport.width;
            var sH = viewport.height;
            var sL = Math.sqrt(sW * sW + sH * sH);

            this.sMainRect
                .attr("x", 0)
                .attr("y", 0)
                .attr("width", sW)
                .attr("height", sH)
                .attr("fill", statusColor);

            this.sKPIText
                .attr("x", sW * 0.5)
                .attr("y", sH * 0.12 + sH * 0.05)
                .attr("fill", "white")
                .attr("style", "font-family:calibri;font-size:" + sL * 0.07 + "px")
                .attr("text-anchor", "middle")
                .text(this.kpiText);

            this.sKPIActualText
                .attr("x", sW * 0.5)
                .attr("y", sH * 0.45)
                .attr("fill", "white")
                .attr("style", "font-weight:bold;font-family:calibri;font-size:" + sL * 0.08 + "px")
                .attr("text-anchor", "middle")
                .text(this.getFormattedValue(dataView, this.kpiActual));

            var diffText = "";
            if (this.kpiTargetExists) {
                diffText = "(" + GetKPIActualDiffFromGoal(this.kpiActual, this.kpiGoal, this.kpiBandingCompareType) + ")";
            }
            this.sKPIActualDiffText
                .attr("x", sW * 0.95)
                .attr("y", sH * 0.45)
                .attr("fill", "white")
                .attr("style", "font-weight:bold;font-family:calibri;font-size:" + sL * 0.05 + "px")
                .attr("text-anchor", "end")
                .text(diffText);

            if (this.kpiChartType === StatusChartType.LineChart) {
                // Line chart
                var lineFunction = d3.svg.line()
                    .x(function (d) { return d.x; })
                    .y(function (d) { return d.y; })
                    .interpolate("linear");

                this.sLinePath
                    .attr("d", lineFunction(dataPoints))
                    .attr("stroke", "white")
                    .attr("stroke-width", sH * 0.015)
                    .attr("fill", "none")
                    .attr("stroke-linejoin", "round");

                var selectionCircle = this.sMainGroupElement2.selectAll("circle").data(dataPoints, function (d) { return d.dataId; });

                selectionCircle.enter()
                    .append("circle")
                    .classed(".circle112", true)
                    .attr("cx", function (d) { return d.x; })
                    .attr("cy", function (d) { return d.y; })
                    .attr("r", sH * 0.02)
                    .attr("fill", statusColor)
                    .attr("stroke", "white")
                    .attr("stroke-width", sH * 0.015);

                selectionCircle.exit().remove();
                this.sLinePath.attr("visibility", "visible");
                this.sMainGroupElement2.selectAll("rect").remove();
                if (!this.kpiHistoryExists) {
                    selectionCircle.attr("visibility", "hidden");
                }

                TooltipManager.addTooltip(selectionCircle, (tooltipEvent: TooltipEvent) => tooltipEvent.data.tooltipInfo);
            }
            else if (this.kpiChartType === StatusChartType.BarChart) {
                // Bar chart
                var selectionBar = this.sMainGroupElement2.selectAll("rect").data(dataPoints, function (d) { return d.dataId; });

                selectionBar.enter().append("rect")
                    .attr("x", function (d) { return d.x - d.w * 0.5; })
                    .attr("y", function (d) { return d.y; })
                    .attr("width", function (d) { return d.w; })
                    .attr("height", function (d) { return d.h; })
                    .attr("fill", "white");

                selectionBar.exit().remove();
                this.sMainGroupElement2.selectAll("circle").remove();
                this.sLinePath.attr("visibility", "hidden");
                if (!this.kpiHistoryExists) {
                    selectionBar.attr("visibility", "hidden");
                }

                TooltipManager.addTooltip(selectionBar, (tooltipEvent: TooltipEvent) => tooltipEvent.data.tooltipInfo);
            }
        }

        private getDefaultFormatSettings(): CardFormatSetting {
            return {
                showTitle: true,
                labelSettings: dataLabelUtils.getDefaultLabelSettings(true, Card.DefaultStyle.value.color, 0),
                wordWrap: false
            };
        }

        public getMetaDataColumn(dataView: DataView) {
            if (dataView && dataView.metadata && dataView.metadata.columns) {
                for (var i = 0, ilen = dataView.metadata.columns.length; i < ilen; i++) {
                    var column = dataView.metadata.columns[i];
                    if (column.isMeasure) {
                        this.metaDataColumn = column;
                        break;
                    }
                }
            }
        }

        protected getFormatString(column: DataViewMetadataColumn): string {
            debug.assertAnyValue(column, 'column');
            return valueFormatter.getFormatString(column, AnimatedText.formatStringProp);
        }

        private static getPropNumeric(dataView: DataView, propertyGroupName: string, propertyName: string, defaultValue: number): number {
            if (dataView) {
                var objects = dataView.metadata.objects;
                if (objects) {
                    var propGroup = objects[propertyGroupName];
                    if (propGroup) {
                        var propValue = <number>propGroup[propertyName];
                        if (propValue)
                            return propValue;
                    }
                }
            }
            return defaultValue;
        }

        private static getPropString(dataView: DataView, propertyGroupName: string, propertyName: string, defaultValue: string): string {
            if (dataView) {
                var objects = dataView.metadata.objects;
                if (objects) {
                    var propGroup = objects[propertyGroupName];
                    if (propGroup) {
                        var propValue = <string>propGroup[propertyName];
                        if (propValue)
                            return propValue;
                    }
                }
            }
            return defaultValue;
        }

        private static getProp_KPIName(dataView: DataView) {
            return KPIStatusWithHistory.getPropString(dataView, 'general', 'pKPIName', 'Name of KPI');
        }

        private static getProp_BandingPercentage(dataView: DataView) {
            return KPIStatusWithHistory.getPropNumeric(dataView, 'general', 'pBandingPercentage', 5);
        }

        private static getProp_BandingType(dataView: DataView) {
            return KPIStatusWithHistory.getPropString(dataView, 'general', 'pBandingType', 'IIB');
        }

        private static getProp_BandingCompareType(dataView: DataView) {
            return KPIStatusWithHistory.getPropString(dataView, 'general', 'pBandingCompareType', 'REL');
        }

        private static getProp_ChartType(dataView: DataView) {
            return KPIStatusWithHistory.getPropString(dataView, 'general', 'pChartType', 'LINE');
        }

        public enumerateObjectInstances(options: EnumerateVisualObjectInstancesOptions): VisualObjectInstance[] {
            var instances: VisualObjectInstance[] = [];
            var dataView = this.dataView;
            switch (options.objectName) {
                case 'general':
                    var general: VisualObjectInstance = {
                        objectName: 'general',
                        displayName: 'General',
                        selector: null,
                        properties: {
                            pKPIName: KPIStatusWithHistory.getProp_KPIName(dataView),
                            pBandingPercentage: KPIStatusWithHistory.getProp_BandingPercentage(dataView),
                            pBandingType: KPIStatusWithHistory.getProp_BandingType(dataView),
                            pBandingCompareType: KPIStatusWithHistory.getProp_BandingCompareType(dataView),
                            pChartType: KPIStatusWithHistory.getProp_ChartType(dataView)
                        }
                    };
                    instances.push(general);
                    break;
            }
            return instances;
        }

        public destroy(): void {
            this.svg = null;
        }
    }

    var StatusColor = { RED: "#DC0002", YELLOW: "#F6C000", GREEN: "#96C401" };
    var StatusBandingType = { IncreasingIsBetter: "IIB", DecreasingIsBetter: "DIB", CloserIsBetter: "CIB" };
    var StatusBandingCompareType = { Absolute: "ABS", Relative: "REL" };
    var StatusChartType = { LineChart: "LINE", BarChart: "BAR" };

    function GetKPIActualDiffFromGoal(dActual, dGoal, oBandingCompareType) {
        var retValue = "";
        if (dActual > dGoal) {
            retValue += "+";
        }
        if (oBandingCompareType === StatusBandingCompareType.Relative) {
            retValue += Math.round(1000 * (dActual - dGoal) / dGoal) / 10 + " %";
        }
        else if (oBandingCompareType === StatusBandingCompareType.Absolute) {
            retValue += Math.round(1000 * (dActual - dGoal)) / 10 + " %";
        }
        return retValue;
    }

    function GetBandingActual(dGoal, dPercentBandingCalculated, dPercentBanding, oBandingCompareType) {
        var retValue = 0;
        if (oBandingCompareType === StatusBandingCompareType.Relative) {
            retValue = dGoal * dPercentBandingCalculated;
        }
        else if (oBandingCompareType === StatusBandingCompareType.Absolute) {
            retValue = dGoal - dPercentBanding;
        }
        return retValue;
    }

    function GetStatusColor(dActual, dGoal, oBandingType, oBandingCompareType, dPercentBanding) {
        var ReturnStatusColor = StatusColor.YELLOW;
        var dActualBandingGY, dActualBandingRY;
        switch (oBandingType) {
            case StatusBandingType.IncreasingIsBetter:
                dActualBandingGY = dGoal;
                dActualBandingRY = GetBandingActual(dGoal, (1 - dPercentBanding), dPercentBanding, oBandingCompareType);
                if (dActual >= dActualBandingGY) {
                    ReturnStatusColor = StatusColor.GREEN;
                }
                else if (dActual <= dActualBandingRY) {
                    ReturnStatusColor = StatusColor.RED;
                }
                break;
            case StatusBandingType.DecreasingIsBetter:
                dActualBandingGY = dGoal;
                dActualBandingRY = GetBandingActual(dGoal, (1 + dPercentBanding), -dPercentBanding, oBandingCompareType);
                if (dActual <= dActualBandingGY) {
                    ReturnStatusColor = StatusColor.GREEN;
                }
                else if (dActual > dActualBandingRY) {
                    ReturnStatusColor = StatusColor.RED;
                }
                break;
            case StatusBandingType.CloserIsBetter:
                var dActualBandingGY_Pos = GetBandingActual(dGoal, (1 + (dPercentBanding * 0.5)), -(dPercentBanding * 0.5), oBandingCompareType);
                var dActualBandingGY_Neg = GetBandingActual(dGoal, (1 - (dPercentBanding * 0.5)), (dPercentBanding * 0.5), oBandingCompareType);
                var dActualBandingRY_Pos = GetBandingActual(dGoal, (1 + (dPercentBanding * 1.5)), -(dPercentBanding * 1.0), oBandingCompareType);
                var dActualBandingRY_Neg = GetBandingActual(dGoal, (1 - (dPercentBanding * 1.5)), (dPercentBanding * 1.0), oBandingCompareType);
                if (dActual <= dActualBandingGY_Pos && dActual >= dActualBandingGY_Neg) {
                    ReturnStatusColor = StatusColor.GREEN;
                }
                else if (dActual > dActualBandingRY_Pos || dActual < dActualBandingRY_Neg) {
                    ReturnStatusColor = StatusColor.RED;
                }
                break;
            default:
                break;
        }
        return ReturnStatusColor;
    }
}