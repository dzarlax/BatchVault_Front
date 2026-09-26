import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';
import { useWorkspace } from '../../utils/workspaceContext';

interface DataPoint {
  date: Date;
  value: number;
}

interface AreaChartProps {
  data: DataPoint[];
  width?: number;
  height?: number;
  color?: string;
  showGrid?: boolean;
  showTooltip?: boolean;
  currency?: string;
}

export const AreaChart: React.FC<AreaChartProps> = ({
  data,
  width = 800,
  height = 300,
  color = '#8B2635',
  showGrid = true,
  showTooltip = true,
  currency: currencyProp,
}) => {
  const { selectedCurrency } = useWorkspace();
  const currency = currencyProp || selectedCurrency;
  const svgRef = useRef<SVGSVGElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!svgRef.current || data.length === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    const margin = { top: 20, right: 20, bottom: 30, left: 50 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg
      .append('g')
      .attr('transform', `translate(${margin.left},${margin.top})`);

    // Create scales
    const x = d3
      .scaleTime()
      .domain(d3.extent(data, (d) => d.date) as [Date, Date])
      .range([0, innerWidth]);

    const y = d3
      .scaleLinear()
      .domain(d3.extent(data, (d) => d.value) as [number, number])
      .range([innerHeight, 0]);

    // Create area generator
    const area = d3
      .area<DataPoint>()
      .x((d) => x(d.date))
      .y0(innerHeight)
      .y1((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    // Create line generator
    const line = d3
      .line<DataPoint>()
      .x((d) => x(d.date))
      .y((d) => y(d.value))
      .curve(d3.curveMonotoneX);

    // Add gradient
    const gradient = svg
      .append('defs')
      .append('linearGradient')
      .attr('id', 'area-gradient')
      .attr('gradientUnits', 'userSpaceOnUse')
      .attr('x1', 0)
      .attr('x2', 0)
      .attr('y1', y(d3.max(data, (d) => d.value) || 0))
      .attr('y2', innerHeight);

    gradient
      .append('stop')
      .attr('offset', '0%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0.5);

    gradient
      .append('stop')
      .attr('offset', '100%')
      .attr('stop-color', color)
      .attr('stop-opacity', 0);

    // Add grid lines
    if (showGrid) {
      g.append('g')
        .attr('class', 'grid')
        .call(
          d3
            .axisLeft(y)
            .ticks(5)
            .tickSize(-innerWidth)
            .tickFormat(() => '')
        )
        .selectAll('line')
        .attr('stroke-dasharray', '3,3')
        .attr('stroke', 'var(--border-primary)');
    }

    // Add area
    g.append('path')
      .datum(data)
      .attr('fill', 'url(#area-gradient)')
      .attr('d', area);

    // Add line
    g.append('path')
      .datum(data)
      .attr('fill', 'none')
      .attr('stroke', color)
      .attr('stroke-width', '2.5')
      .attr('d', line);

    // Add axes
    g.append('g')
      .attr('transform', `translate(0,${innerHeight})`)
      .call(d3.axisBottom(x).ticks(5))
      .selectAll('text')
      .attr('fill', 'var(--text-tertiary)')
      .attr('font-size', '12px');

    g.append('g')
      .call(d3.axisLeft(y).ticks(5))
      .selectAll('text')
      .attr('fill', 'var(--text-tertiary)')
      .attr('font-size', '12px');

    // Add dots and tooltips
    if (showTooltip) {
      g.selectAll('.dot')
        .data(data)
        .enter()
        .append('circle')
        .attr('class', 'dot')
        .attr('cx', (d) => x(d.date))
        .attr('cy', (d) => y(d.value))
        .attr('r', 4)
        .attr('fill', color)
        .attr('stroke', 'white')
        .attr('stroke-width', 2)
        .style('opacity', 0)
        .on('mouseover', function (event, d) {
          d3.select(this).style('opacity', 1);

          if (tooltipRef.current) {
            tooltipRef.current.style.display = 'block';
            tooltipRef.current.style.left = `${event.pageX + 10}px`;
            tooltipRef.current.style.top = `${event.pageY - 10}px`;
            tooltipRef.current.innerHTML = `
              <div style="font-weight: 600; margin-bottom: 4px;">
                ${d.date.toLocaleDateString()}
              </div>
              <div style="font-size: 14px;">
                ${d.value.toFixed(2)}
                ${currency || ''}
              </div>
            `;
          }
        })
        .on('mouseout', function () {
          d3.select(this).style('opacity', 0);
          if (tooltipRef.current) {
            tooltipRef.current.style.display = 'none';
          }
        });
    }
  }, [data, width, height, color, showGrid, showTooltip, currency]);

  if (data.length === 0) return null;

  return (
    <>
      <svg ref={svgRef} width={width} height={height} />
      <div
        ref={tooltipRef}
        style={{
          position: 'absolute',
          display: 'none',
          background: 'var(--surface-sidebar)',
          color: 'var(--text-inverse)',
          padding: '8px 12px',
          borderRadius: '8px',
          fontSize: '12px',
          pointerEvents: 'none',
          boxShadow: 'var(--shadow-lg)',
          zIndex: 1000,
        }}
      />
    </>
  );
};

export default AreaChart;
