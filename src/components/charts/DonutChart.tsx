import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface DataPoint {
  label: string;
  value: number;
  color?: string;
}

interface DonutChartProps {
  data: DataPoint[];
  size?: number;
  innerRadius?: number;
  showLegend?: boolean;
  centerText?: string;
  centerSubtext?: string;
  currency?: string;
}

export const DonutChart: React.FC<DonutChartProps> = ({
  data,
  size = 300,
  innerRadius = 100,
  showLegend = true,
  centerText,
  centerSubtext,
  currency,
}) => {
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    // Create tooltip element if it doesn't exist
    if (!tooltipRef.current) {
      tooltipRef.current = d3.select('body')
        .append('div')
        .attr('class', 'donut-chart-tooltip')
        .style('position', 'absolute')
        .style('padding', '8px 12px')
        .style('background', 'rgba(0, 0, 0, 0.85)')
        .style('color', 'white')
        .style('border-radius', '6px')
        .style('font-size', '13px')
        .style('font-weight', '500')
        .style('pointer-events', 'none')
        .style('opacity', '0')
        .style('transition', 'opacity 0.2s')
        .style('z-index', '10000')
        .style('box-shadow', '0 4px 6px rgba(0, 0, 0, 0.1)')
        .node() as HTMLDivElement;
    }

    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const radius = size / 2;
    const colorScale = d3
      .scaleOrdinal<string, string>()
      .domain(data.map((d) => d.label))
      .range(data.map((d) => d.color || d3.schemeCategory10[data.indexOf(d) % 10]));

    // Create pie
    const pie = d3.pie<DataPoint>().value((d) => d.value).sort(null);

    // Create arc
    const arc = d3
      .arc<d3.PieArcDatum<DataPoint>>()
      .innerRadius(innerRadius)
      .outerRadius(radius - 10);

    const arcHover = d3
      .arc<d3.PieArcDatum<DataPoint>>()
      .innerRadius(innerRadius)
      .outerRadius(radius - 5);

    // Add arcs
    const g = svg
      .append('g')
      .attr('transform', `translate(${radius},${radius})`);

    const arcs = g
      .selectAll('.arc')
      .data(pie(data))
      .enter()
      .append('g')
      .attr('class', 'arc')
      .style('cursor', 'pointer');

    arcs
      .append('path')
      .attr('d', arc)
      .attr('fill', (d) => colorScale(d.data.label))
      .attr('stroke', 'var(--surface-primary)')
      .attr('stroke-width', '2')
      .style('opacity', 0.9)
      .on('mouseover', function (event, d) {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arcHover)
          .style('opacity', 1);

        // Show tooltip
        const tooltip = d3.select(tooltipRef.current);
        const percentage = (d.data.value / data.reduce((sum, item) => sum + item.value, 0)) * 100;

        tooltip
          .style('opacity', '1')
          .html(`
            <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
              <div style="width: 12px; height: 12px; background: ${colorScale(d.data.label)}; border-radius: 2px;"></div>
              <span style="font-weight: 600;">${d.data.label}</span>
            </div>
            <div style="margin-top: 4px;">
              <span style="color: #9ca3af;">Значение:</span>
              <span style="font-weight: 700; margin-left: 4px;">${d.data.value}${currency ? ` ${currency}` : ''}</span>
            </div>
            <div style="margin-top: 2px;">
              <span style="color: #9ca3af;">Процент:</span>
              <span style="font-weight: 700; margin-left: 4px; color: ${percentage >= 20 ? 'var(--chart-accent-good)' : 'var(--chart-accent-warn)'};">${percentage.toFixed(1)}%</span>
            </div>
          `);
      })
      .on('mousemove', function (event) {
        // Position tooltip near cursor
        const tooltip = d3.select(tooltipRef.current);
        const tooltipNode = tooltipRef.current;
        if (tooltipNode) {
          const tooltipWidth = tooltipNode.offsetWidth;
          const tooltipHeight = tooltipNode.offsetHeight;
          const xOffset = 15;
          const yOffset = 15;

          let left = event.pageX + xOffset;
          let top = event.pageY + yOffset;

          // Prevent tooltip from going off screen
          if (left + tooltipWidth > window.innerWidth) {
            left = event.pageX - tooltipWidth - xOffset;
          }
          if (top + tooltipHeight > window.innerHeight) {
            top = event.pageY - tooltipHeight - yOffset;
          }

          tooltip
            .style('left', left + 'px')
            .style('top', top + 'px');
        }
      })
      .on('mouseout', function () {
        d3.select(this)
          .transition()
          .duration(200)
          .attr('d', arc)
          .style('opacity', 0.9);

        // Hide tooltip
        d3.select(tooltipRef.current)
          .style('opacity', '0');
      });

    // Add center text
    if (centerText || centerSubtext) {
      const textGroup = svg
        .append('g')
        .attr('transform', `translate(${radius},${radius})`)
        .attr('text-anchor', 'middle');

      if (centerText) {
        textGroup
          .append('text')
          .attr('dy', '-0.5em')
          .style('font-size', innerRadius <= 60 ? '28px' : '32px')
          .style('font-weight', '700')
          .style('fill', 'var(--text-primary)')
          .text(centerText);
      }

      if (centerSubtext) {
        textGroup
          .append('text')
          .attr('dy', '1.5em')
          .style('font-size', innerRadius <= 60 ? '12px' : '14px')
          .style('fill', 'var(--text-secondary)')
          .text(centerSubtext);
      }
    }

    // Add legend
    if (showLegend) {
      const legend = svg
        .append('g')
        .attr('transform', `translate(${size + 20},${radius - data.length * 15})`);

      legend
        .selectAll('.legend-item')
        .data(data)
        .enter()
        .append('g')
        .attr('class', 'legend-item')
        .attr('transform', (d, i) => `translate(0,${i * 30})`)
        .each(function (d) {
          const g = d3.select(this);

          g.append('rect')
            .attr('width', 16)
            .attr('height', 16)
            .attr('rx', 4)
            .attr('fill', colorScale(d.label));

          g.append('text')
            .attr('x', 24)
            .attr('y', 13)
            .style('font-size', '13px')
            .style('fill', 'var(--text-secondary)')
            .text(`${d.label} (${d.value})`);
        });
    }

    // Cleanup tooltip on unmount
    return () => {
      if (tooltipRef.current) {
        d3.select(tooltipRef.current).remove();
        tooltipRef.current = null;
      }
    };
  }, [data, size, innerRadius, showLegend, centerText, centerSubtext, currency]);

  if (data.length === 0) return null;

  const legendWidth = showLegend ? 200 : 0;

  return (
    <svg
      ref={svgRef}
      width={size + legendWidth}
      height={size}
      style={{ overflow: 'visible' }}
    />
  );
};

export default DonutChart;
