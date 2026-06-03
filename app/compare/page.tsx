"use client";

import { useState, useEffect, useCallback } from "react";
import Image from "next/image";
import Link from 'next/link';

export default function ComparePage() {
  const [properties, setProperties] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get selected property IDs from localStorage (set by PropertyGrid)
  const getSelectedIds = useCallback(() => {
    const selected = localStorage.getItem('comparedProperties');
    return selected ? JSON.parse(selected) : [];
  }, []);

  // Fetch property details from Supabase
  const fetchProperties = useCallback(async (ids: string[]) => {
    if (ids.length === 0) {
      setProperties([]);
      return;
    }

    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/properties/compare', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || `Request failed (${res.status})`);
      setProperties(json.properties ?? []);
    } catch (err: any) {
      setError(err.message);
      setProperties([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Load properties when component mounts or selected IDs change
  useEffect(() => {
    const ids = getSelectedIds();
    fetchProperties(ids);
  }, [getSelectedIds, fetchProperties]);

  // Clear comparison
  const clearComparison = () => {
    localStorage.removeItem('comparedProperties');
    setProperties([]);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
          <p className="mt-2 text-gray-600">Loading properties...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600">Error loading properties: {error}</p>
          <button 
            onClick={clearComparison}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  if (properties.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <p className="text-gray-600">No properties selected for comparison</p>
          <Link 
            href="/properties" 
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            Browse Properties
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Property Comparison</h1>
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">
              Comparing {properties.length} property{properties.length !== 1 ? 's' : ''}
            </span>
            <button 
              onClick={clearComparison}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
            >
              Clear Comparison
            </button>
          </div>
        </div>

        {/* Properties grid for comparison */}
        <div className="grid gap-6">
          {properties.map((property) => (
            <div 
              key={property.id} 
              className="bg-white rounded-xl shadow-sm border overflow-hidden hover:shadow-md transition"
            >
              {/* Property image */}
              <div className={`h-48 relative flex items-center justify-center overflow-hidden ${
                property.brochure_url ? 'bg-gray-100' : 'bg-gradient-to-br from-blue-500 to-indigo-600'
              }`}>
                {property.brochure_url ? (
                  // unoptimized: brochure_url points at arbitrary builder /
                  // PropMarket hosts that aren't in remotePatterns. We still
                  // get lazy-load + no layout shift from the `fill` parent
                  // (h-48 relative) without needing to allowlist per builder.
                  <Image
                    src={property.brochure_url}
                    alt="Property thumbnail"
                    fill
                    sizes="(max-width: 768px) 100vw, 33vw"
                    unoptimized
                    className="object-cover"
                  />
                ) : (
                  <div className="text-center px-4 text-white">
                    <div className="text-3xl mb-1">🏘️</div>
                    <div className="text-sm font-bold">{property.builder_name || 'Property'}</div>
                    <div className="text-xs opacity-90">
                      {[property.suburb, property.state].filter(Boolean).join(', ') || '—'}
                    </div>
                  </div>
                )}
                <span className="absolute top-2 right-2 bg-green-500 text-white px-2 py-1 text-xs font-bold rounded shadow-sm capitalize">
                  {property.status || 'available'}
                </span>
              </div>

              {/* Property details */}
              <div className="p-6 space-y-4">
                {/* Header */}
                <div className="flex justify-between items-start">
                  <div>
                    <h2 className="text-xl font-bold text-gray-900">
                      ${(property.total_package_price || property.house_price)?.toLocaleString() || 'Price TBD'}
                    </h2>
                    <p className="text-sm text-gray-500">
                      {property.street_address || property.suburb || 'Unknown'}{property.suburb && property.street_address ? `, ${property.suburb}` : ''} {property.state}
                    </p>
                  </div>
                  <Link 
                    href={`/properties/${property.id}`} 
                    className="text-gray-500 hover:text-gray-900 text-xs font-semibold underline-offset-2 hover:underline"
                  >
                    Detail →
                  </Link>
                </div>

                {/* Specs grid */}
                <div className="grid grid-cols-2 gap-4 text-sm text-gray-700 font-medium">
                  <div>
                    <span className="block text-xs text-gray-500 uppercase">Bedrooms</span>
                    <span className="block font-semibold">{property.bedrooms || '-'}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500 uppercase">Bathrooms</span>
                    <span className="block font-semibold">{property.bathrooms || '-'}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500 uppercase">Car Spaces</span>
                    <span className="block font-semibold">{property.car_spaces || '-'}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500 uppercase">Land Size</span>
                    <span className="block font-semibold">
                      {property.land_size ? `${property.land_size} m²` : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500 uppercase">House Size</span>
                    <span className="block font-semibold">
                      {property.house_size ? `${property.house_size} m²` : '-'}
                    </span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500 uppercase">Builder</span>
                    <span className="block font-semibold">{property.builder_name || 'Unknown'}</span>
                  </div>
                  <div>
                    <span className="block text-xs text-gray-500 uppercase">Property Type</span>
                    <span className="block font-semibold">{property.property_type || '-'}</span>
                  </div>
                </div>

                {/* Description */}
                <div className="border-t pt-4">
                  <p className="text-sm text-gray-600 leading-relaxed">
                    {property.description || 'No description available.'}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Summary comparison table for 2+ properties */}
        {properties.length >= 2 && (
          <div className="mt-10">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Side-by-Side Comparison</h2>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Feature</th>
                    {properties.map((prop, index) => (
                      <th 
                        key={prop.id} 
                        className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase"
                      >
                        Property {index + 1}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200">
                  {/* Price */}
                  <tr className="bg-white">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Price</td>
                    {properties.map((prop) => (
                      <td 
                        key={prop.id} 
                        className="px-6 py-4 text-sm font-semibold text-gray-900"
                      >
                        ${(prop.total_package_price || prop.house_price)?.toLocaleString() || 'TBD'}
                      </td>
                    ))}
                  </tr>
                  
                  {/* Bedrooms */}
                  <tr className="bg-white">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Bedrooms</td>
                    {properties.map((prop) => (
                      <td 
                        key={prop.id} 
                        className="px-6 py-4 text-sm text-gray-700"
                      >
                        {prop.bedrooms || '-'}
                      </td>
                    ))}
                  </tr>
                  
                  {/* Bathrooms */}
                  <tr className="bg-white">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Bathrooms</td>
                    {properties.map((prop) => (
                      <td 
                        key={prop.id} 
                        className="px-6 py-4 text-sm text-gray-700"
                      >
                        {prop.bathrooms || '-'}
                      </td>
                    ))}
                  </tr>
                  
                  {/* Car Spaces */}
                  <tr className="bg-white">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Car Spaces</td>
                    {properties.map((prop) => (
                      <td 
                        key={prop.id} 
                        className="px-6 py-4 text-sm text-gray-700"
                      >
                        {prop.car_spaces || '-'}
                      </td>
                    ))}
                  </tr>
                  
                  {/* Land Size */}
                  <tr className="bg-white">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Land Size</td>
                    {properties.map((prop) => (
                      <td 
                        key={prop.id} 
                        className="px-6 py-4 text-sm text-gray-700"
                      >
                        {prop.land_size ? `${prop.land_size} m²` : '-'}
                      </td>
                    ))}
                  </tr>
                  
                  {/* House Size */}
                  <tr className="bg-white">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">House Size</td>
                    {properties.map((prop) => (
                      <td 
                        key={prop.id} 
                        className="px-6 py-4 text-sm text-gray-700"
                      >
                        {prop.house_size ? `${prop.house_size} m²` : '-'}
                      </td>
                    ))}
                  </tr>
                  
                  {/* Builder */}
                  <tr className="bg-white">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Builder</td>
                    {properties.map((prop) => (
                      <td 
                        key={prop.id} 
                        className="px-6 py-4 text-sm text-gray-700"
                      >
                        {prop.builder_name || 'Unknown'}
                      </td>
                    ))}
                  </tr>
                  
                  {/* Status */}
                  <tr className="bg-white">
                    <td className="px-6 py-4 text-sm font-medium text-gray-900">Status</td>
                    {properties.map((prop) => (
                      <td 
                        key={prop.id} 
                        className="px-6 py-4 text-sm text-gray-700"
                      >
                        {prop.status || 'available'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}