---
name: property-comparison
description: "Guide for using and extending the property comparison feature in the NextKey CRM."
version: 1.0.0
author: Hermes Agent
platforms: [linux, macos, windows]
tags: [feature-guide, comparison, properties, nextjs]
---

# Property Comparison Feature Guide

This skill documents the property comparison feature implemented for the NextKey CRM. It allows users to select multiple properties and compare them side-by-side.

## Overview

The comparison feature consists of two main parts:
1. Enhanced PropertyGrid component with a "Compare" button
2. Dedicated Compare page (`/app/compare/page.tsx`) for displaying comparisons

## How It Works

### Selection Process
1. Users select properties using checkboxes in the PropertyGrid
2. When 2+ properties are selected, a "Compare" button appears in the toolbar
3. Clicking the button:
   - Saves selected property IDs to localStorage (`comparedProperties`)
   - Navigates to `/compare` page

### Comparison Page
1. On mount, reads selected IDs from localStorage
2. Fetches full property data from Supabase `global_stock_pool` table
3. Displays properties in cards with key details
4. Shows side-by-side comparison table for 2+ properties
5. Provides "Clear Comparison" button to reset

## Key Files

- `/app/properties/PropertyGrid.tsx` - Enhanced with compare functionality
- `/app/compare/page.tsx` - Dedicated comparison page
- `/utils/supabase.ts` - Supabase client (used for data fetching)

## Implementation Details

### PropertyGrid Changes
- Added `useRouter` import and initialization
- Added compare button in toolbar section (conditionally rendered)
- Button handler saves IDs to localStorage and navigates to compare page
- Uses existing `checkedIds` state to track selections

### ComparePage Features
- `useCallback` hooks for efficient function recreation
- `localStorage.getItem` to retrieve selected IDs
- Supabase query to fetch property data by IDs
- Loading, error, and empty states
- Responsive property card display
- Side-by-side comparison table (for 2+ properties)
- Clear comparison functionality

## Extending the Feature

### Adding More Comparison Fields
To add additional fields to the comparison table:

1. Edit `/app/compare/page.tsx`
2. Add the field to the property object destructuring
3. Add a new row in the comparison table `<tbody>`
4. Add corresponding header in `<thead>`
5. Add corresponding data cell in the mapping function

### Modifying Selection Behavior
To change how properties are selected:

1. Modify the checkbox handling in PropertyGrid
2. Adjust the logic in `toggleCheck` and `toggleAll` functions
3. Update the condition for showing the compare button (currently `checkedIds.size >= 2`)

### Styling Changes
The component uses Tailwind CSS classes. To modify styling:

1. Update class names in the JSX elements
2. Follow the existing design system patterns
3. Check responsiveness at different breakpoints

## Best Practices

### Performance
- The feature only fetches data for selected properties (efficient)
- Consider adding pagination if users might select many properties
- Debounce any future search/filter additions

### Error Handling
- Proper error states are implemented
- Consider adding retry logic for failed Supabase requests
- Validate localStorage data to handle corruption

### Accessibility
- Ensure sufficient color contrast for status badges
- Add ARIA labels to interactive elements
- Test keyboard navigation
- Consider adding skip-to-content links

### Testing
- Test with 0, 1, 2, and many properties selected
- Test error cases (network failure, invalid IDs)
- Test localStorage persistence across page reloads
- Verify mobile responsiveness

## Troubleshooting

### Compare Button Not Showing
1. Verify at least 2 properties are selected
2. Check browser console for JavaScript errors
3. Confirm localStorage is working in the browser
4. Check that router.push is being called (add debug logging)

### Data Not Loading on Compare Page
1. Verify localStorage contains valid property IDs
2. Check Supabase connection and permissions
3. Confirm `global_stock_pool` table exists and is accessible
4. Check network tab for API requests and responses

### Styling Issues
1. Verify Tailwind CSS is properly configured
2. Check for conflicting CSS rules
3. Test at different viewport sizes
4. Verify class names match existing patterns

## Integration with Existing Features

The comparison feature integrates seamlessly with:
- Existing property filtering and search
- Property detail pages (links in comparison cards)
- War Room functionality (separate selection mechanism)
- Existing Supabase data layer
- Marketing skills (properties can be used in campaigns)

## Future Enhancements

1. **Individual Property Removal**: Allow removing specific properties from comparison
2. **Export Functionality**: PDF/CSV export of comparison data
3. **Shareable Links**: URL-based comparison sharing
4. **Persistent Comparisons**: Save comparisons to user account
5. **Advanced Analytics**: Side-by-side financial projections
6. **Template Comparisons**: Save comparison templates for common evaluations
